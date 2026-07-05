using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using ExStore.API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text.Json;

namespace ExStore.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SharesController : ControllerBase
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly IConfiguration _configuration;
    private static readonly SemaphoreSlim _lock = new(1, 1);
    private const string AuthContainerName = "exstore-auth";
    private const string SharesBlobName = "shares.json";

    public SharesController(BlobServiceClient blobServiceClient, IConfiguration configuration)
    {
        _blobServiceClient = blobServiceClient;
        _configuration = configuration;
    }

    private string CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new InvalidOperationException("User ID claim missing");

    private BlobContainerClient GetFilesContainer() =>
        _blobServiceClient.GetBlobContainerClient(
            _configuration["AzureBlobStorage:ContainerName"]
            ?? _configuration["BlobStorage:ContainerName"]
            ?? "exstore-files");

    private BlobContainerClient GetAuthContainer() =>
        _blobServiceClient.GetBlobContainerClient(AuthContainerName);

    private async Task<List<ShareRecord>> LoadSharesAsync()
    {
        var container = GetAuthContainer();
        await container.CreateIfNotExistsAsync();
        var blob = container.GetBlobClient(SharesBlobName);
        if (!await blob.ExistsAsync()) return [];
        var download = await blob.DownloadContentAsync();
        return JsonSerializer.Deserialize<List<ShareRecord>>(
            download.Value.Content,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
    }

    private async Task SaveSharesAsync(List<ShareRecord> shares)
    {
        var container = GetAuthContainer();
        await container.CreateIfNotExistsAsync();
        var blob = container.GetBlobClient(SharesBlobName);
        var json = JsonSerializer.SerializeToUtf8Bytes(
            shares, new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        await blob.UploadAsync(new BinaryData(json), overwrite: true);
    }

    /// <summary>List the current user's shares. Optionally filter by blobName.</summary>
    [HttpGet]
    public async Task<IActionResult> GetMyShares([FromQuery] string? blobName = null)
    {
        var userId = CurrentUserId;
        var shares = await LoadSharesAsync();
        IEnumerable<ShareRecord> result = shares.Where(s => s.OwnerId == userId);
        if (!string.IsNullOrEmpty(blobName))
            result = result.Where(s => s.BlobName == blobName);
        return Ok(result.OrderByDescending(s => s.CreatedAt));
    }

    /// <summary>Create a share link for a file or directory.</summary>
    [HttpPost]
    public async Task<IActionResult> CreateShare([FromBody] CreateShareRequest request)
    {
        var userId = CurrentUserId;

        // Security: users may only share their own blobs
        if (!request.BlobName.StartsWith($"{userId}/", StringComparison.Ordinal))
            return Forbid();

        if (request.Type != "Public" && request.Type != "Internal")
            return BadRequest(new { message = "Type must be 'Public' or 'Internal'." });

        if (string.IsNullOrWhiteSpace(request.BlobName))
            return BadRequest(new { message = "BlobName is required." });

        var share = new ShareRecord
        {
            OwnerId = userId,
            OwnerName = User.FindFirstValue(ClaimTypes.Name) ?? "",
            BlobName = request.BlobName,
            DisplayName = request.DisplayName,
            IsDirectory = request.IsDirectory,
            Type = request.Type
        };

        await _lock.WaitAsync();
        try
        {
            var shares = await LoadSharesAsync();

            // Return existing share if the same blobName+type already has one
            var existing = shares.FirstOrDefault(s =>
                s.OwnerId == userId &&
                s.BlobName == request.BlobName &&
                s.Type == request.Type);
            if (existing != null) return Ok(existing);

            shares.Add(share);
            await SaveSharesAsync(shares);
            return Ok(share);
        }
        finally { _lock.Release(); }
    }

    /// <summary>Revoke (delete) a share. Only the owner can revoke.</summary>
    [HttpDelete("{shareId}")]
    public async Task<IActionResult> RevokeShare(string shareId)
    {
        var userId = CurrentUserId;
        await _lock.WaitAsync();
        try
        {
            var shares = await LoadSharesAsync();
            var share = shares.FirstOrDefault(s => s.Id == shareId);
            if (share == null) return NotFound();
            if (share.OwnerId != userId) return Forbid();
            shares.Remove(share);
            await SaveSharesAsync(shares);
            return NoContent();
        }
        finally { _lock.Release(); }
    }

    /// <summary>
    /// Access a shared item. Public shares require no auth.
    /// Internal shares require a valid JWT.
    /// </summary>
    [HttpGet("{shareId}/access")]
    [AllowAnonymous]
    public async Task<IActionResult> AccessShare(string shareId)
    {
        var shares = await LoadSharesAsync();
        var share = shares.FirstOrDefault(s => s.Id == shareId);
        if (share == null)
            return NotFound(new { message = "Share not found or has been revoked." });

        // Internal shares require authentication
        if (share.Type == "Internal")
        {
            var authUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(authUserId))
                return Unauthorized(new { message = "This link requires you to be signed in to ExStore.", requiresAuth = true });
        }

        var container = GetFilesContainer();
        var sasExpiry = DateTimeOffset.UtcNow.AddHours(2);

        if (share.IsDirectory)
        {
            var prefix = share.BlobName.TrimEnd('/') + "/";
            var items = new List<FileModel>();

            await foreach (var item in container.GetBlobsByHierarchyAsync(delimiter: "/", prefix: prefix))
            {
                if (item.IsPrefix)
                {
                    items.Add(new FileModel
                    {
                        FileName = item.Prefix.TrimEnd('/'),
                        ContentType = "directory",
                        IsDirectory = true,
                        UploadedAt = DateTime.UtcNow,
                        BlobUri = string.Empty
                    });
                }
                else
                {
                    var blob = item.Blob;
                    if (blob.Name.EndsWith("/.keep", StringComparison.OrdinalIgnoreCase)) continue;
                    var blobClient = container.GetBlobClient(blob.Name);
                    var blobUri = blobClient.CanGenerateSasUri
                        ? blobClient.GenerateSasUri(BlobSasPermissions.Read, sasExpiry).ToString()
                        : blobClient.Uri.ToString();
                    items.Add(new FileModel
                    {
                        FileName = blob.Name,
                        Size = blob.Properties.ContentLength ?? 0,
                        ContentType = blob.Properties.ContentType ?? string.Empty,
                        UploadedAt = blob.Properties.LastModified?.UtcDateTime ?? DateTime.UtcNow,
                        BlobUri = blobUri
                    });
                }
            }

            items = items
                .OrderBy(f => f.IsDirectory ? 0 : 1)
                .ThenByDescending(f => f.UploadedAt)
                .ToList();

            return Ok(new { share = ShareSummary(share), items });
        }
        else
        {
            var blobClient = container.GetBlobClient(share.BlobName);
            if (!await blobClient.ExistsAsync())
                return NotFound(new { message = "The shared file no longer exists." });

            var blobUri = blobClient.CanGenerateSasUri
                ? blobClient.GenerateSasUri(BlobSasPermissions.Read, sasExpiry).ToString()
                : blobClient.Uri.ToString();

            var props = await blobClient.GetPropertiesAsync();
            var item = new FileModel
            {
                FileName = share.BlobName,
                Size = props.Value.ContentLength,
                ContentType = props.Value.ContentType,
                BlobUri = blobUri
            };
            return Ok(new { share = ShareSummary(share), items = new[] { item } });
        }
    }

    private static object ShareSummary(ShareRecord s) => new
    {
        s.Id,
        s.DisplayName,
        s.IsDirectory,
        s.Type,
        s.OwnerName,
        createdAt = s.CreatedAt.ToString("o")
    };
}
