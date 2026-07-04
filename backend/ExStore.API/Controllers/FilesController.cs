using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using ExStore.API.Models;
using ExStore.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using System.Net.Http.Headers;
using System.Security.Claims;

namespace ExStore.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FilesController : ControllerBase
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FilesController> _logger;
    private readonly UserService _userService;

    private const int MinQuotaGB = 1;
    private const int MaxQuotaGB = 100;

    public FilesController(
        BlobServiceClient blobServiceClient,
        IConfiguration configuration,
        ILogger<FilesController> logger,
        UserService userService)
    {
        _blobServiceClient = blobServiceClient;
        _configuration = configuration;
        _logger = logger;
        _userService = userService;
    }

    private string CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new InvalidOperationException("User ID claim missing");

    private BlobContainerClient GetContainer() =>
        _blobServiceClient.GetBlobContainerClient(
            _configuration["AzureBlobStorage:ContainerName"]
            ?? _configuration["BlobStorage:ContainerName"]
            ?? "exstore-files");

    // Calculate total bytes used by a user (sums all blobs under their prefix)
    private async Task<long> GetStorageUsedAsync(BlobContainerClient container, string userId)
    {
        long total = 0;
        await foreach (var blob in container.GetBlobsAsync(prefix: $"{userId}/"))
            total += blob.Properties.ContentLength ?? 0;
        return total;
    }

    // Resolve per-user quota in bytes (falls back to 5 GB default)
    private async Task<long> GetUserQuotaBytesAsync(string userId)
    {
        var user = await _userService.GetByIdAsync(userId);
        var gb = Math.Clamp(user?.StorageQuotaGB ?? 5, MinQuotaGB, MaxQuotaGB);
        return (long)gb * 1024 * 1024 * 1024;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<FileModel>>> GetFiles(
        [FromQuery] int page = 1,
        [FromQuery] int? pageSize = null,
        [FromQuery] string? path = null)
    {
        try
        {
            var userId = CurrentUserId;
            var effectivePageSize = pageSize ?? _configuration.GetValue<int>("Files:PageSize", 10);
            effectivePageSize = Math.Clamp(effectivePageSize, 1, 200);
            page = Math.Max(1, page);

            var container = GetContainer();
            var sasExpiryHours = _configuration.GetValue<int>("Files:SasExpiryHours", 1);
            var sasExpiry = DateTimeOffset.UtcNow.AddHours(sasExpiryHours);

            // Build prefix for current "directory" level
            var safePath = SanitizePath(path);
            var prefix = string.IsNullOrEmpty(safePath)
                ? $"{userId}/"
                : $"{userId}/{safePath}/";

            var items = new List<FileModel>();
            long storageUsed = 0;

            // Calculate total storage used by this user (all blobs)
            await foreach (var blob in container.GetBlobsAsync(prefix: $"{userId}/"))
                storageUsed += blob.Properties.ContentLength ?? 0;

            // List current directory level with hierarchy (dirs + files)
            await foreach (var item in container.GetBlobsByHierarchyAsync(delimiter: "/", prefix: prefix))
            {
                if (item.IsPrefix)
                {
                    // Virtual sub-directory
                    var dirFullPath = item.Prefix.TrimEnd('/');
                    var dirName = dirFullPath.Split('/').Last();
                    items.Add(new FileModel
                    {
                        FileName = dirFullPath, // full internal path
                        ContentType = "directory",
                        IsDirectory = true,
                        UploadedAt = DateTime.UtcNow,
                        BlobUri = string.Empty
                    });
                }
                else
                {
                    var blob = item.Blob;
                    // Skip .keep placeholder files used to anchor empty dirs
                    if (blob.Name.EndsWith("/.keep", StringComparison.OrdinalIgnoreCase)) continue;

                    var blobClient = container.GetBlobClient(blob.Name);
                    var blobUri = blobClient.CanGenerateSasUri
                        ? blobClient.GenerateSasUri(BlobSasPermissions.Read, sasExpiry).ToString()
                        : blobClient.Uri.ToString();

                    var size = blob.Properties.ContentLength ?? 0;

                    items.Add(new FileModel
                    {
                        FileName = blob.Name,
                        Size = size,
                        ContentType = blob.Properties.ContentType ?? string.Empty,
                        UploadedAt = blob.Properties.LastModified?.UtcDateTime ?? DateTime.UtcNow,
                        BlobUri = blobUri
                    });
                }
            }

            // Directories first, then files newest-first
            items = items
                .OrderBy(f => f.IsDirectory ? 0 : 1)
                .ThenByDescending(f => f.UploadedAt)
                .ToList();

            var totalCount = items.Count;
            var totalPages = (int)Math.Ceiling(totalCount / (double)effectivePageSize);
            var pagedItems = items
                .Skip((page - 1) * effectivePageSize)
                .Take(effectivePageSize)
                .ToList();

            return Ok(new PagedResult<FileModel>
            {
                Items = pagedItems,
                TotalCount = totalCount,
                Page = page,
                PageSize = effectivePageSize,
                TotalPages = Math.Max(1, totalPages),
                StorageUsedBytes = storageUsed,
                StorageQuotaBytes = await GetUserQuotaBytesAsync(userId)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving files");
            return StatusCode(500, "Error retrieving files");
        }
    }

    [HttpPost("upload")]
    [DisableRequestSizeLimit]
    public async Task<ActionResult<FileModel>> UploadFile()
    {
        // Read path from query string directly to avoid model binding triggering form body reading
        var path = Request.Query["path"].FirstOrDefault();

        if (string.IsNullOrEmpty(Request.ContentType) ||
            !Request.ContentType.Contains("multipart/form-data", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Multipart form-data required");

        var boundary = Request.ContentType
            .Split(';')
            .Select(p => p.Trim())
            .FirstOrDefault(p => p.StartsWith("boundary=", StringComparison.OrdinalIgnoreCase))
            ?["boundary=".Length..].Trim('"');

        if (string.IsNullOrEmpty(boundary))
            return BadRequest("Missing multipart boundary");

        var userId = CurrentUserId;
        var container = GetContainer();
        await container.CreateIfNotExistsAsync();

        // Check upload lock
        var currentUser = await _userService.GetByIdAsync(userId);
        if (currentUser is null) return Unauthorized();
        if (currentUser.IsUploadLocked)
            return StatusCode(403, new { message = "Your upload access has been locked by an admin." });

        // Quota pre-check
        var quotaBytes = await GetUserQuotaBytesAsync(userId);
        var used = await GetStorageUsedAsync(container, userId);
        if (used >= quotaBytes)
            return StatusCode(413, new { message = $"Storage quota exceeded ({currentUser.StorageQuotaGB} GB limit).", storageUsedBytes = used, storageQuotaBytes = quotaBytes });

        var reader = new MultipartReader(boundary, HttpContext.Request.Body);
        MultipartSection? section;

        while ((section = await reader.ReadNextSectionAsync()) != null)
        {
            if (!ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var cd))
                continue;
            if (string.IsNullOrEmpty(cd.FileName))
                continue;

            var originalName = Path.GetFileName(cd.FileName.Trim('"'));
            var contentType = section.ContentType ?? "application/octet-stream";

            // Preserve relative path from folder upload (e.g. "subdir/file.jpg")
            var rawName = cd.FileName.Trim('"').Replace('\\', '/');
            var relativeDir = rawName.Contains('/') ? SanitizePath(rawName[..rawName.LastIndexOf('/')]) : null;

            // Determine storage path: ?path param takes precedence, then relative dir from folder upload
            var safePath = SanitizePath(path);
            if (!string.IsNullOrEmpty(relativeDir))
                safePath = string.IsNullOrEmpty(safePath) ? relativeDir : $"{safePath}/{relativeDir}";

            var pathPrefix = string.IsNullOrEmpty(safePath) ? "" : $"{safePath}/";
            var blobName = $"{userId}/{pathPrefix}{Guid.NewGuid()}_{originalName}";
            var blobClient = container.GetBlobClient(blobName);

            await blobClient.UploadAsync(section.Body, new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = contentType },
                TransferOptions = new StorageTransferOptions
                {
                    MaximumConcurrency = 4,
                    MaximumTransferSize = 8 * 1024 * 1024
                }
            });

            var props = await blobClient.GetPropertiesAsync();
            return Ok(new FileModel
            {
                FileName = blobName,
                ContentType = contentType,
                Size = props.Value.ContentLength,
                BlobUri = blobClient.Uri.ToString()
            });
        }

        return BadRequest("No file found in request");
    }

    [HttpDelete("{*blobName}")]
    public async Task<IActionResult> DeleteFile(string blobName)
    {
        var userId = CurrentUserId;

        // Security: users can only delete their own blobs
        if (!blobName.StartsWith($"{userId}/", StringComparison.Ordinal))
            return Forbid();

        try
        {
            var container = GetContainer();
            // If blobName ends with '/' it's a directory prefix — delete all blobs under it
            if (blobName.EndsWith('/'))
            {
                await foreach (var blob in container.GetBlobsAsync(prefix: blobName))
                    await container.GetBlobClient(blob.Name).DeleteIfExistsAsync();
            }
            else
            {
                await container.GetBlobClient(blobName).DeleteIfExistsAsync();
            }
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting {BlobName}", blobName);
            return StatusCode(500, "Error deleting file");
        }
    }

    /// <summary>Create an empty directory (uploads a hidden .keep placeholder).</summary>
    [HttpPost("directory")]
    public async Task<IActionResult> CreateDirectory([FromQuery] string name, [FromQuery] string? path = null)
    {
        var userId = CurrentUserId;
        var safeName = SanitizePath(name);
        if (string.IsNullOrEmpty(safeName))
            return BadRequest("Invalid directory name.");

        var safePath = SanitizePath(path);
        var fullPath = string.IsNullOrEmpty(safePath) ? safeName : $"{safePath}/{safeName}";
        var placeholder = $"{userId}/{fullPath}/.keep";

        var container = GetContainer();
        await container.CreateIfNotExistsAsync();
        await container.GetBlobClient(placeholder).UploadAsync(
            BinaryData.FromString(""), overwrite: true);
        return Ok(new { path = fullPath });
    }

    // Sanitize a virtual path: strip leading/trailing slashes, reject traversal
    private static string SanitizePath(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var parts = raw.Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        var safe = parts.Where(p => p != ".." && p != "." && !string.IsNullOrWhiteSpace(p)).ToArray();
        return string.Join('/', safe);
    }
}

