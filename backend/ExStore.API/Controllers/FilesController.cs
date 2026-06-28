using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using ExStore.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using System.Net.Http.Headers;

namespace ExStore.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FilesController> _logger;

    public FilesController(BlobServiceClient blobServiceClient, IConfiguration configuration, ILogger<FilesController> logger)
    {
        _blobServiceClient = blobServiceClient;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<FileModel>>> GetFiles(
        [FromQuery] int page = 1,
        [FromQuery] int? pageSize = null)
    {
        try
        {
            var effectivePageSize = pageSize ?? _configuration.GetValue<int>("Files:PageSize", 10);
            effectivePageSize = Math.Clamp(effectivePageSize, 1, 100);
            page = Math.Max(1, page);

            var containerName = _configuration["AzureBlobStorage:ContainerName"]
                ?? _configuration["BlobStorage:ContainerName"]
                ?? "exstore-files";
            var container = _blobServiceClient.GetBlobContainerClient(containerName);

            var allFiles = new List<FileModel>();
            var sasExpiryHours = _configuration.GetValue<int>("Files:SasExpiryHours", 1);
            var sasExpiry = DateTimeOffset.UtcNow.AddHours(sasExpiryHours);

            await foreach (var blob in container.GetBlobsAsync())
            {
                var blobClient = container.GetBlobClient(blob.Name);
                var blobUri = blobClient.CanGenerateSasUri
                    ? blobClient.GenerateSasUri(BlobSasPermissions.Read, sasExpiry).ToString()
                    : blobClient.Uri.ToString();

                allFiles.Add(new FileModel
                {
                    FileName = blob.Name,
                    Size = blob.Properties.ContentLength ?? 0,
                    ContentType = blob.Properties.ContentType ?? string.Empty,
                    UploadedAt = blob.Properties.LastModified?.UtcDateTime ?? DateTime.UtcNow,
                    BlobUri = blobUri
                });
            }

            // Sort newest first
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
                TotalPages = Math.Max(1, totalPages)
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
        // Validate multipart content type
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

        var containerName = _configuration["AzureBlobStorage:ContainerName"]
            ?? _configuration["BlobStorage:ContainerName"]
            ?? "exstore-files";
        var container = _blobServiceClient.GetBlobContainerClient(containerName);
        await container.CreateIfNotExistsAsync();

        // Stream each multipart section directly to Azure — no temp disk used
        var reader = new MultipartReader(boundary, HttpContext.Request.Body);
        MultipartSection? section;

        while ((section = await reader.ReadNextSectionAsync()) != null)
        {
            if (!ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var cd))
                continue;
            if (string.IsNullOrEmpty(cd.FileName))
                continue;

            // Sanitize filename to prevent path traversal
            var originalName = Path.GetFileName(cd.FileName.Trim('"'));
            var contentType = section.ContentType ?? "application/octet-stream";
            var blobName = $"{Guid.NewGuid()}_{originalName}";
            var blobClient = container.GetBlobClient(blobName);

            // Upload directly from HTTP stream → Azure Blob Storage (no disk buffer)
            await blobClient.UploadAsync(section.Body, new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = contentType },
                TransferOptions = new StorageTransferOptions
                {
                    MaximumConcurrency = 4,          // 4 parallel block uploads
                    MaximumTransferSize = 8 * 1024 * 1024  // 8 MB per block
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

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteFile(string id)
    {
        try
        {
            var containerName = _configuration["AzureBlobStorage:ContainerName"]
                ?? _configuration["BlobStorage:ContainerName"]
                ?? "exstore-files";
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            var blobClient = container.GetBlobClient(id);

            await blobClient.DeleteIfExistsAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting file");
            return StatusCode(500, "Error deleting file");
        }
    }
}
