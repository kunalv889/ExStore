using Azure.Storage.Blobs;
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
    public async Task<ActionResult<List<FileModel>>> GetFiles()
    {
        try
        {
            var files = new List<FileModel>();
            var containerName = _configuration["AzureBlobStorage:ContainerName"] ?? "exstore-files";
            var container = _blobServiceClient.GetBlobContainerClient(containerName);

            await foreach (var blob in container.GetBlobsAsync())
            {
                files.Add(new FileModel
                {
                    FileName = blob.Name,
                    Size = blob.Properties.ContentLength ?? 0,
                    BlobUri = container.GetBlobClient(blob.Name).Uri.ToString()
                });
            }

            return Ok(files);
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
            var containerName = _configuration["AzureBlobStorage:ContainerName"] ?? "exstore-files";
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
            var containerName = _configuration["AzureBlobStorage:ContainerName"] ?? "exstore-files";
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
