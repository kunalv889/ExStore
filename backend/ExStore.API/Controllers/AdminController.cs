using Azure.Storage.Blobs;
using ExStore.API.Models;
using ExStore.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Security.Cryptography;

namespace ExStore.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly UserService _users;
    private readonly BlobServiceClient _blob;
    private readonly IConfiguration _config;
    private readonly IEmailService _email;

    public AdminController(UserService users, BlobServiceClient blob, IConfiguration config, IEmailService email)
    {
        _users = users;
        _blob = blob;
        _config = config;
        _email = email;
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetAllUsers()
    {
        var users = await _users.GetAllAsync();
        return Ok(users.Select(AuthController.ToDto));
    }

    [HttpGet("users/pending")]
    public async Task<IActionResult> GetPendingUsers()
    {
        var users = await _users.GetAllAsync();
        return Ok(users
            .Where(u => !u.IsApproved && u.Role == UserRole.User)
            .Select(AuthController.ToDto));
    }

    [HttpPost("users/{id}/approve")]
    public async Task<IActionResult> ApproveUser(string id)
    {
        var user = await _users.GetByIdAsync(id);
        if (user is null) return NotFound();

        user.IsApproved = true;
        await _users.UpdateAsync(user);
        return Ok(new { message = $"{user.Name} has been approved." });
    }

    [HttpPost("users/{id}/revoke")]
    public async Task<IActionResult> RevokeUser(string id)
    {
        var adminId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id == adminId) return BadRequest("Cannot revoke your own access");

        var user = await _users.GetByIdAsync(id);
        if (user is null) return NotFound();
        if (user.Role == UserRole.Admin) return BadRequest("Cannot revoke another admin");

        user.IsApproved = false;
        await _users.UpdateAsync(user);
        return Ok(new { message = $"{user.Name}'s access has been revoked." });
    }

    /// <summary>Update per-user storage quota (1–100 GB) and upload lock.</summary>
    [HttpPut("users/{id}/settings")]
    public async Task<IActionResult> UpdateUserSettings(string id, [FromBody] UserSettingsRequest req)
    {
        if (req.StorageQuotaGB < 1 || req.StorageQuotaGB > 100)
            return BadRequest("StorageQuotaGB must be between 1 and 100.");

        var user = await _users.GetByIdAsync(id);
        if (user is null) return NotFound();

        user.StorageQuotaGB = req.StorageQuotaGB;
        user.IsUploadLocked = req.IsUploadLocked;
        await _users.UpdateAsync(user);

        return Ok(AuthController.ToDto(user));
    }

    /// <summary>Nullify a user's email verification — they must re-verify before signing in.</summary>
    [HttpPost("users/{id}/reset-email-verification")]
    public async Task<IActionResult> ResetEmailVerification(string id)
    {
        var adminId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id == adminId) return BadRequest("Cannot reset your own email verification");

        var user = await _users.GetByIdAsync(id);
        if (user is null) return NotFound();
        if (user.Role == UserRole.Admin) return BadRequest("Cannot reset another admin's email verification");

        user.IsEmailVerified = false;
        user.EmailVerificationToken = GenerateVerificationToken();
        user.EmailVerificationExpiry = DateTime.UtcNow.AddHours(24);
        await _users.UpdateAsync(user);

        var baseUrl = (_config["Frontend:BaseUrl"] ?? "https://exstore.kunalverma.site").TrimEnd('/');
        var verifyUrl = $"{baseUrl}/verify-email?token={Uri.EscapeDataString(user.EmailVerificationToken)}";
        await _email.SendVerificationEmailAsync(user.Email, user.Name, verifyUrl);

        return Ok(new { message = $"{user.Name}'s email verification has been reset. A new verification email has been sent." });
    }

    /// <summary>Permanently delete a user account and all their data.</summary>
    [HttpDelete("users/{id}")]
    public async Task<IActionResult> DeleteUser(string id)
    {
        var adminId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id == adminId) return BadRequest("Cannot delete your own account");

        var user = await _users.GetByIdAsync(id);
        if (user is null) return NotFound();
        if (user.Role == UserRole.Admin) return BadRequest("Cannot delete another admin account");

        var authContainer = _config["Auth:UsersContainer"] ?? "exstore-auth";
        var filesContainerName = _config["BlobStorage:ContainerName"] ?? "exstore-files";

        // Delete all user files
        var filesContainer = _blob.GetBlobContainerClient(filesContainerName);
        await foreach (var blobItem in filesContainer.GetBlobsAsync(prefix: $"{id}/"))
            await filesContainer.GetBlobClient(blobItem.Name).DeleteIfExistsAsync();

        // Delete avatar
        if (!string.IsNullOrEmpty(user.AvatarBlobName))
        {
            var authCont = _blob.GetBlobContainerClient(authContainer);
            await authCont.GetBlobClient(user.AvatarBlobName).DeleteIfExistsAsync();
        }

        // Remove user's share records
        var sharesContainer = _blob.GetBlobContainerClient(authContainer);
        var sharesBlob = sharesContainer.GetBlobClient("shares.json");
        if (await sharesBlob.ExistsAsync())
        {
            var download = await sharesBlob.DownloadContentAsync();
            var shares = System.Text.Json.JsonSerializer.Deserialize<List<ShareRecord>>(
                download.Value.Content,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
            var remaining = shares.Where(s => s.OwnerId != id).ToList();
            var json = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(
                remaining, new System.Text.Json.JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            await sharesBlob.UploadAsync(new BinaryData(json), overwrite: true);
        }

        await _users.DeleteAsync(id);
        return NoContent();
    }

    private static string GenerateVerificationToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
}
