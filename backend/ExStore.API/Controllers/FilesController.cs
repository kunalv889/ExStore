using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using ExStore.API.Models;
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

    private const long QuotaBytes = 5L * 1024 * 1024 * 1024; // 5 GB per user

    public FilesController(BlobServiceClient blobServiceClient, IConfiguration configuration, ILogger<FilesController> logger)
    {
        _blobServiceClient = blobServiceClient;
        _configuration = configuration;
        _logger = logger;
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

    [HttpGet]
    public async Task<ActionResult<PagedResult<FileModel>>> GetFiles(
        [FromQuery] int page = 1,
        [FromQuery] int? pageSize = null)
    {
        try
        {
            var userId = CurrentUserId;
            var effectivePageSize = pageSize ?? _configuration.GetValue<int>("Files:PageSize", 10);
            effectivePageSize = Math.Clamp(effectivePageSize, 1, 100);
            page = Math.Max(1, page);

            var container = GetContainer();
            var sasExpiryHours = _configuration.GetValue<int>("Files:SasExpiryHours", 1);
            var sasExpiry = DateTimeOffset.UtcNow.AddHours(sasExpiryHours);

            var allFiles = new List<FileModel>();
            long storageUsed = 0;

            // Only list blobs belonging to this user
            await foreach (var blob in container.GetBlobsAsync(prefix: $"{userId}/"))
            {
                var blobClient = container.GetBlobClient(blob.Name);
                var blobUri = blobClient.CanGenerateSasUri
                    ? blobClient.GenerateSasUri(BlobSasPermissions.Read, sasExpiry).ToString()
                    : blobClient.Uri.ToString();

                var size = blob.Properties.ContentLength ?? 0;
                storageUsed += size;

                allFiles.Add(new FileModel
                {
                    FileName = blob.Name,
                    Size = size,
                    ContentType = blob.Properties.ContentType ?? string.Empty,
                    UploadedAt = blob.Properties.LastModified?.UtcDateTime ?? DateTime.UtcNow,
                    BlobUri = blobUri
                });
            }

            allFiles = allFiles.OrderByDescending(f => f.UploadedAt).ToList();

            var totalCount = allFiles.Count;
            var totalPages = (int)Math.Ceiling(totalCount / (double)effectivePageSize);
            var items = allFiles
                .Skip((page - 1) * effectivePageSize)
                .Take(effectivePageSize)
                .ToList();

            return Ok(new PagedResult<FileModel>
            {
                Items = items,
                TotalCount = totalCount,
                Page = page,
                PageSize = effectivePageSize,
                TotalPages = Math.Max(1, totalPages),
                StorageUsedBytes = storageUsed,
                StorageQuotaBytes = QuotaBytes
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
    [RequestFormLimits(MultipartBodyLengthLimit = long.MaxValue)]
    public async Task<ActionResult<FileModel>> UploadFile()
    {
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

        // Quota pre-check: reject if already at limit
        var used = await GetStorageUsedAsync(container, userId);
        if (used >= QuotaBytes)
            return StatusCode(413, new { message = "Storage quota exceeded (5 GB limit).", storageUsedBytes = used, storageQuotaBytes = QuotaBytes });

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

            // Store under user's "folder": {userId}/{guid}_{filename}
            var blobName = $"{userId}/{Guid.NewGuid()}_{originalName}";
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

        // Security: users can only delete their own files
        if (!blobName.StartsWith($"{userId}/", StringComparison.Ordinal))
            return Forbid();

        try
        {
            var container = GetContainer();
            await container.GetBlobClient(blobName).DeleteIfExistsAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting file {BlobName}", blobName);
            return StatusCode(500, "Error deleting file");
        }
    }
}

