using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using ExStore.API.Models;
using Microsoft.AspNetCore.Mvc;

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
    public async Task<ActionResult<FileModel>> UploadFile([FromForm] IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File is required");

        try
        {
            var containerName = _configuration["AzureBlobStorage:ContainerName"]
                ?? _configuration["BlobStorage:ContainerName"]
                ?? "exstore-files";
            var container = _blobServiceClient.GetBlobContainerClient(containerName);

            // Ensure container exists
            await container.CreateIfNotExistsAsync();

            var blobName = $"{Guid.NewGuid()}_{file.FileName}";
            var blobClient = container.GetBlobClient(blobName);

            using (var stream = file.OpenReadStream())
            {
                await blobClient.UploadAsync(stream, overwrite: true);
            }

            var fileModel = new FileModel
            {
                FileName = file.FileName,
                ContentType = file.ContentType,
                Size = file.Length,
                BlobUri = blobClient.Uri.ToString()
            };

            return CreatedAtAction(nameof(GetFiles), new { id = fileModel.Id }, fileModel);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading file");
            return StatusCode(500, "Error uploading file");
        }
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
