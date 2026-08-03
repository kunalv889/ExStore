using Azure;
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
using System.Text.Json;

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
    private readonly EncryptionService _encryption;

    private const int MinQuotaGB = 1;
    private const int MaxQuotaGB = 100;

    public FilesController(
        BlobServiceClient blobServiceClient,
        IConfiguration configuration,
        ILogger<FilesController> logger,
        UserService userService,
        EncryptionService encryption)
    {
        _blobServiceClient = blobServiceClient;
        _configuration = configuration;
        _logger = logger;
        _userService = userService;
        _encryption = encryption;
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
            var apiBase = $"{Request.Scheme}://{Request.Host}";

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
                    var dirFullPath = item.Prefix.TrimEnd('/');
                    items.Add(new FileModel
                    {
                        FileName = dirFullPath,
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

                    var encodedName = string.Join("/", blob.Name.Split('/').Select(Uri.EscapeDataString));
                    var proxyUrl = $"{apiBase}/api/files/download/{encodedName}";

                    items.Add(new FileModel
                    {
                        FileName = blob.Name,
                        Size = blob.Properties.ContentLength ?? 0,
                        ContentType = blob.Properties.ContentType ?? string.Empty,
                        UploadedAt = blob.Properties.LastModified?.UtcDateTime ?? DateTime.UtcNow,
                        BlobUri = proxyUrl
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

            // --- File type validation (magic bytes) ---
            var (typeError, validatedStream) = await FileTypeValidator.ValidateAsync(section.Body);
            if (typeError != null)
                return BadRequest(new { message = typeError });

            // --- Encryption ---
            // Ensure this user has an encryption key (lazy generate for legacy accounts)
            if (string.IsNullOrEmpty(currentUser.EncryptedKey))
            {
                currentUser.EncryptedKey = _encryption.WrapKey(_encryption.GenerateKey());
                await _userService.UpdateAsync(currentUser);
            }
            var userKey = _encryption.UnwrapKey(currentUser.EncryptedKey);
            var (encryptingStream, iv) = _encryption.CreateEncryptingReadStream(validatedStream, userKey);

            await blobClient.UploadAsync(encryptingStream, new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = contentType },
                Metadata = new Dictionary<string, string>
                {
                    [EncryptionService.IvMetadataKey] = Convert.ToHexString(iv)
                },
                TransferOptions = new StorageTransferOptions { MaximumConcurrency = 1 }
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

    /// <summary>
    /// Download and decrypt a file.
    /// Accepts either: JWT in Authorization header (owner access) OR ?shareId= (share-based access).
    /// Backward compatible: files without an IV in metadata are served as-is (legacy unencrypted files).
    /// </summary>
    [HttpGet("download/{*blobName}")]
    [AllowAnonymous]
    public async Task<IActionResult> DownloadFile(string blobName)
    {
        var container = GetContainer();
        var blobClient = container.GetBlobClient(blobName);

        if (!await blobClient.ExistsAsync())
            return NotFound();

        // --- Authorize access ---
        var (authError, ownerUserId) = await AuthorizeBlobAccessAsync(blobName);
        if (authError != null) return authError;

        // --- Get owner's encryption key ---
        var owner = await _userService.GetByIdAsync(ownerUserId!);
        if (owner == null) return NotFound();

        // --- Stream the blob (decrypting if encrypted) ---
        var props = await blobClient.GetPropertiesAsync();
        var contentType = props.Value.ContentType ?? "application/octet-stream";

        // Extract original filename for Content-Disposition
        var rawFileName = blobName.Split('/').Last();
        var underscoreIdx = rawFileName.IndexOf('_');
        if (underscoreIdx > 0 && Guid.TryParse(rawFileName[..underscoreIdx], out _))
            rawFileName = rawFileName[(underscoreIdx + 1)..];
        var safeFileName = Uri.EscapeDataString(rawFileName);

        var blobDownload = await blobClient.DownloadStreamingAsync();
        Stream contentStream = blobDownload.Value.Content;

        // Decrypt if this blob was encrypted (has IV in metadata)
        if (props.Value.Metadata.TryGetValue(EncryptionService.IvMetadataKey, out var ivHex)
            && !string.IsNullOrEmpty(ivHex)
            && !string.IsNullOrEmpty(owner.EncryptedKey))
        {
            var userKey = _encryption.UnwrapKey(owner.EncryptedKey);
            var iv = Convert.FromHexString(ivHex);
            contentStream = _encryption.CreateDecryptingReadStream(contentStream, userKey, iv);
        }

        Response.Headers.Append("Cache-Control", "private, max-age=3600");
        // When ?download=1 is passed, force the browser to save the file (attachment) rather than
        // render it inline. Lets clients trigger a direct streamed download without buffering.
        var forceDownload = Request.Query["download"].FirstOrDefault() is "1" or "true";
        var disposition = forceDownload ? "attachment" : "inline";
        Response.Headers.Append("Content-Disposition", $"{disposition}; filename*=UTF-8''{safeFileName}");

        return File(contentStream, contentType, enableRangeProcessing: false);
    }

    /// <summary>
    /// Stream a (decrypted) file with HTTP Range support so &lt;video&gt;/&lt;audio&gt; elements can
    /// play and seek large media on the fly without downloading the whole file.
    /// Auth: JWT (owner — via Authorization header or ?access_token=) OR ?shareId= (share-based).
    /// Encrypted files are decrypted per-range using AES-CBC block alignment.
    /// </summary>
    [HttpGet("stream/{*blobName}")]
    [AllowAnonymous]
    public async Task<IActionResult> StreamFile(string blobName)
    {
        var container = GetContainer();
        var blobClient = container.GetBlobClient(blobName);

        if (!await blobClient.ExistsAsync())
            return NotFound();

        var (authError, ownerUserId) = await AuthorizeBlobAccessAsync(blobName);
        if (authError != null) return authError;

        var owner = await _userService.GetByIdAsync(ownerUserId!);
        if (owner == null) return NotFound();

        var props = await blobClient.GetPropertiesAsync();
        var contentType = props.Value.ContentType ?? "application/octet-stream";
        var encryptedLength = props.Value.ContentLength;

        var isEncrypted = props.Value.Metadata.TryGetValue(EncryptionService.IvMetadataKey, out var ivHex)
            && !string.IsNullOrEmpty(ivHex)
            && !string.IsNullOrEmpty(owner.EncryptedKey);

        byte[]? userKey = null;
        byte[]? iv = null;
        long plaintextLength;

        if (isEncrypted)
        {
            userKey = _encryption.UnwrapKey(owner.EncryptedKey!);
            iv = Convert.FromHexString(ivHex!);
            plaintextLength = await GetPlaintextLengthAsync(blobClient, encryptedLength, userKey, iv);
        }
        else
        {
            plaintextLength = encryptedLength;
        }

        // --- Parse a single Range header (in plaintext coordinates) ---
        long start = 0, end = plaintextLength - 1;
        var isPartial = false;
        var rangeHeader = Request.Headers.Range.FirstOrDefault();
        if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase))
        {
            var spec = rangeHeader["bytes=".Length..].Split(',')[0].Trim();
            var dash = spec.IndexOf('-');
            if (dash >= 0)
            {
                var startStr = spec[..dash];
                var endStr = spec[(dash + 1)..];
                if (string.IsNullOrEmpty(startStr))
                {
                    // Suffix range: last N bytes
                    if (long.TryParse(endStr, out var suffix) && suffix > 0)
                    {
                        start = Math.Max(0, plaintextLength - suffix);
                        isPartial = true;
                    }
                }
                else if (long.TryParse(startStr, out var s))
                {
                    start = s;
                    if (!string.IsNullOrEmpty(endStr) && long.TryParse(endStr, out var e))
                        end = Math.Min(e, plaintextLength - 1);
                    isPartial = true;
                }
            }

            if (start > end || start >= plaintextLength || start < 0)
            {
                Response.Headers["Content-Range"] = $"bytes */{plaintextLength}";
                return StatusCode(StatusCodes.Status416RangeNotSatisfiable);
            }
        }

        var length = end - start + 1;

        Stream bodyStream = isEncrypted
            ? await CreateDecryptedRangeStreamAsync(blobClient, encryptedLength, userKey!, iv!, start, length)
            : (await blobClient.DownloadStreamingAsync(new BlobDownloadOptions { Range = new HttpRange(start, length) })).Value.Content;

        Response.Headers["Accept-Ranges"] = "bytes";
        Response.Headers["Cache-Control"] = "private, max-age=3600";
        Response.Headers["Content-Disposition"] = "inline";
        Response.ContentType = contentType;
        Response.ContentLength = length;
        if (isPartial)
        {
            Response.Headers["Content-Range"] = $"bytes {start}-{end}/{plaintextLength}";
            Response.StatusCode = StatusCodes.Status206PartialContent;
        }

        try
        {
            await bodyStream.CopyToAsync(Response.Body, 64 * 1024, HttpContext.RequestAborted);
        }
        catch (OperationCanceledException) { /* client seeked/closed — expected */ }
        finally
        {
            await bodyStream.DisposeAsync();
        }

        return new EmptyResult();
    }

    // Shared authorization for download/stream: returns an error result, or the resolved owner id.
    private async Task<(IActionResult? Error, string? OwnerUserId)> AuthorizeBlobAccessAsync(string blobName)
    {
        var shareId = Request.Query["shareId"].FirstOrDefault();
        var jwtUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!string.IsNullOrEmpty(shareId))
        {
            var authContainer = _blobServiceClient.GetBlobContainerClient(
                _configuration["Auth:UsersContainer"] ?? "exstore-auth");
            var sharesBlob = authContainer.GetBlobClient("shares.json");

            if (!await sharesBlob.ExistsAsync()) return (Forbid(), null);

            var download = await sharesBlob.DownloadContentAsync();
            var shares = System.Text.Json.JsonSerializer.Deserialize<List<ShareRecord>>(
                download.Value.Content,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];

            var share = shares.FirstOrDefault(s => s.Id == shareId);
            if (share == null) return (Forbid(), null);

            var shareBlobPrefix = share.IsDirectory
                ? share.BlobName.TrimEnd('/') + "/"
                : share.BlobName;
            if (!blobName.StartsWith(shareBlobPrefix, StringComparison.Ordinal) && blobName != share.BlobName)
                return (Forbid(), null);

            if (share.Type == "Internal")
            {
                if (string.IsNullOrEmpty(jwtUserId)) return (Unauthorized(), null);
                if (share.AllowedUserIds.Count > 0 && !share.AllowedUserIds.Contains(jwtUserId))
                    return (StatusCode(403, "You don't have permission to view this content."), null);
            }

            return (null, share.OwnerId);
        }

        if (!string.IsNullOrEmpty(jwtUserId))
        {
            var ownerId = blobName.Split('/')[0];
            if (ownerId != jwtUserId) return (Forbid(), null);
            return (null, jwtUserId);
        }

        return (Unauthorized(), null);
    }

    // Determine plaintext length = ciphertext length minus the PKCS7 padding on the final block.
    private async Task<long> GetPlaintextLengthAsync(BlobClient blobClient, long encryptedLength, byte[] userKey, byte[] iv)
    {
        const int block = EncryptionService.BlockSize;
        if (encryptedLength < block) return encryptedLength;

        // Read the last block plus (if present) the preceding block to serve as the CBC IV.
        long readOffset = encryptedLength >= 2 * block ? encryptedLength - 2 * block : 0;
        int readLen = (int)(encryptedLength - readOffset);
        var buf = new byte[readLen];
        var resp = await blobClient.DownloadStreamingAsync(new BlobDownloadOptions { Range = new HttpRange(readOffset, readLen) });
        await ReadExactAsync(resp.Value.Content, buf, readLen);

        var lastBlock = buf[(readLen - block)..];
        var prevBlockOrIv = readLen >= 2 * block ? buf[..block] : iv;
        var pad = _encryption.GetPkcs7PadLength(lastBlock, prevBlockOrIv, userKey);
        return encryptedLength - pad;
    }

    // Build a stream that yields decrypted plaintext bytes [start, start+length) from an AES-CBC blob.
    private async Task<Stream> CreateDecryptedRangeStreamAsync(
        BlobClient blobClient, long encryptedLength, byte[] userKey, byte[] iv, long start, long length)
    {
        const int block = EncryptionService.BlockSize;
        long firstBlock = start / block;
        int intraOffset = (int)(start - firstBlock * block);
        long end = start + length - 1;
        long lastBlock = end / block;

        // For CBC, decrypting block N needs cipher block N-1 as the IV (or the stored IV when N == 0).
        long cipherReadStart = firstBlock == 0 ? 0 : (firstBlock - 1) * block;
        long cipherReadEndExclusive = Math.Min((lastBlock + 1) * block, encryptedLength);
        long cipherReadLen = cipherReadEndExclusive - cipherReadStart;

        var resp = await blobClient.DownloadStreamingAsync(new BlobDownloadOptions
        {
            Range = new HttpRange(cipherReadStart, cipherReadLen)
        });
        Stream cipherStream = resp.Value.Content;

        byte[] effectiveIv;
        if (firstBlock == 0)
        {
            effectiveIv = iv;
        }
        else
        {
            // The first downloaded block is the preceding cipher block — use it as the IV.
            var ivBuf = new byte[block];
            await ReadExactAsync(cipherStream, ivBuf, block);
            effectiveIv = ivBuf;
        }

        var decrypting = _encryption.CreateDecryptingReadStreamNoPadding(cipherStream, userKey, effectiveIv);
        // Skip the offset inside the first block, then cap output to the requested length (this also
        // naturally excludes any PKCS7 padding on the final block).
        return new RangeLimitedStream(decrypting, intraOffset, length);
    }

    private static async Task ReadExactAsync(Stream s, byte[] buffer, int count)
    {
        int total = 0;
        while (total < count)
        {
            int n = await s.ReadAsync(buffer.AsMemory(total, count - total));
            if (n == 0) break;
            total += n;
        }
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

    /// <summary>
    /// Rename a file or folder. Azure Blob Storage has no native rename, so this copies the
    /// blob(s) to the new name (preserving encrypted content, IV metadata and content type)
    /// and deletes the originals.
    /// </summary>
    [HttpPost("rename")]
    public async Task<IActionResult> Rename([FromBody] RenameRequest request)
    {
        var userId = CurrentUserId;

        if (request is null || string.IsNullOrWhiteSpace(request.BlobName) || string.IsNullOrWhiteSpace(request.NewName))
            return BadRequest("Missing parameters.");

        // Security: users can only rename their own blobs
        if (!request.BlobName.StartsWith($"{userId}/", StringComparison.Ordinal))
            return Forbid();

        // New name must be a single, safe path segment
        var newName = request.NewName.Trim();
        if (newName.Contains('/') || newName.Contains('\\') || newName is "." or "..")
            return BadRequest("Invalid name.");

        var container = GetContainer();

        try
        {
            if (request.IsDirectory)
            {
                var oldPrefix = request.BlobName.EndsWith('/') ? request.BlobName : request.BlobName + "/";
                var trimmed = oldPrefix.TrimEnd('/');
                var lastSlash = trimmed.LastIndexOf('/');
                if (lastSlash < 0) return BadRequest("Invalid folder.");

                var parent = trimmed[..lastSlash];
                var newPrefix = $"{parent}/{newName}/";

                if (string.Equals(oldPrefix, newPrefix, StringComparison.Ordinal))
                    return NoContent();

                // Reject if a folder with the target name already exists
                await foreach (var _ in container.GetBlobsAsync(prefix: newPrefix))
                    return Conflict(new { message = "A folder with that name already exists." });

                var toMove = new List<string>();
                await foreach (var blob in container.GetBlobsAsync(prefix: oldPrefix))
                    toMove.Add(blob.Name);
                if (toMove.Count == 0) return NotFound();

                foreach (var name in toMove)
                {
                    var newBlobName = newPrefix + name[oldPrefix.Length..];
                    await CopyBlobAsync(container, name, newBlobName);
                    await container.GetBlobClient(name).DeleteIfExistsAsync();
                }
                return Ok(new { path = newPrefix.TrimEnd('/') });
            }
            else
            {
                var lastSlash = request.BlobName.LastIndexOf('/');
                var dir = request.BlobName[..lastSlash];
                var fileSeg = request.BlobName[(lastSlash + 1)..];

                // Preserve the existing GUID prefix so display names strip correctly
                var guidMatch = System.Text.RegularExpressions.Regex.Match(fileSeg, "^[0-9a-fA-F-]{36}_");
                var guidPrefix = guidMatch.Success ? guidMatch.Value : $"{Guid.NewGuid()}_";
                var newBlobName = $"{dir}/{guidPrefix}{newName}";

                if (string.Equals(newBlobName, request.BlobName, StringComparison.Ordinal))
                    return NoContent();

                var src = container.GetBlobClient(request.BlobName);
                if (!await src.ExistsAsync()) return NotFound();

                await CopyBlobAsync(container, request.BlobName, newBlobName);
                await src.DeleteIfExistsAsync();
                return Ok(new { fileName = newBlobName });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error renaming {BlobName}", request.BlobName);
            return StatusCode(500, "Error renaming item");
        }
    }

    // Copy a blob within the same container using a server-side copy (Azure moves the bytes
    // internally — data never streams through this API). Content, content type and metadata (IV)
    // are preserved automatically. For same-account copies this completes near-instantly
    // regardless of file size.
    private async Task CopyBlobAsync(BlobContainerClient container, string source, string destination)
    {
        var srcClient = container.GetBlobClient(source);
        var destClient = container.GetBlobClient(destination);

        // Server-side copy needs to read the (private) source, so hand it a short-lived read SAS.
        Uri copySource;
        if (srcClient.CanGenerateSasUri)
        {
            var sasBuilder = new BlobSasBuilder(BlobSasPermissions.Read, DateTimeOffset.UtcNow.AddHours(1))
            {
                BlobContainerName = container.Name,
                BlobName = source,
                Resource = "b"
            };
            copySource = srcClient.GenerateSasUri(sasBuilder);
        }
        else
        {
            copySource = srcClient.Uri;
        }

        var operation = await destClient.StartCopyFromUriAsync(copySource);
        await operation.WaitForCompletionAsync();
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

/// <summary>Request body for renaming a file or folder.</summary>
public record RenameRequest(string BlobName, string NewName, bool IsDirectory);

/// <summary>
/// Read-only stream wrapper that first discards <c>skip</c> bytes from the inner stream, then
/// yields at most <c>limit</c> bytes. Used to trim a block-aligned decrypted stream down to the
/// exact requested byte range.
/// </summary>
internal sealed class RangeLimitedStream : Stream
{
    private readonly Stream _inner;
    private long _skip;
    private long _remaining;

    public RangeLimitedStream(Stream inner, long skip, long limit)
    {
        _inner = inner;
        _skip = skip;
        _remaining = limit;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

    private async ValueTask SkipAsync(CancellationToken ct)
    {
        var scratch = new byte[Math.Min(_skip, 64 * 1024)];
        while (_skip > 0)
        {
            int want = (int)Math.Min(_skip, scratch.Length);
            int n = await _inner.ReadAsync(scratch.AsMemory(0, want), ct);
            if (n == 0) { _skip = 0; break; }
            _skip -= n;
        }
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct)
    {
        if (_skip > 0) await SkipAsync(ct);
        if (_remaining <= 0) return 0;
        int want = (int)Math.Min(count, _remaining);
        int read = await _inner.ReadAsync(buffer.AsMemory(offset, want), ct);
        _remaining -= read;
        return read;
    }

    public override int Read(byte[] buffer, int offset, int count)
        => ReadAsync(buffer, offset, count, CancellationToken.None).GetAwaiter().GetResult();

    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing) _inner.Dispose();
        base.Dispose(disposing);
    }
}

