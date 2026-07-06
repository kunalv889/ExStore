using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using ExStore.API.Models;
using ExStore.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace ExStore.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly UserService _users;
    private readonly IConfiguration _config;
    private readonly BlobServiceClient _blobServiceClient;
    private readonly EncryptionService _encryption;

    public AuthController(UserService users, IConfiguration config, BlobServiceClient blobServiceClient, EncryptionService encryption)
    {
        _users = users;
        _config = config;
        _blobServiceClient = blobServiceClient;
        _encryption = encryption;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) ||
            string.IsNullOrWhiteSpace(req.Name) ||
            string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email, name, and password are required");

        if (req.Password.Length < 8)
            return BadRequest("Password must be at least 8 characters");

        var user = new User
        {
            Email = req.Email.Trim().ToLower(),
            Name = req.Name.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = UserRole.User,
            IsApproved = false,
            EncryptedKey = _encryption.WrapKey(_encryption.GenerateKey())
        };

        var created = await _users.CreateAsync(user);
        if (!created)
            return Conflict("An account with this email already exists");

        return Ok(new { message = "Registration successful. Awaiting admin approval before you can sign in." });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password are required");

        var user = await _users.GetByEmailAsync(req.Email.Trim().ToLower());

        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password" });

        if (!user.IsApproved)
            return StatusCode(403, new { message = "Your account is pending admin approval.", status = "pending" });

        return Ok(new { token = GenerateToken(user), user = ToDto(user) });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _users.GetByIdAsync(userId!);
        return user is null ? NotFound() : Ok(ToDto(user));
    }

    [HttpPut("profile")]
    [Authorize]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _users.GetByIdAsync(userId!);
        if (user is null) return NotFound();

        user.Name = req.Name.Trim();
        await _users.UpdateAsync(user);
        return Ok(ToDto(user));
    }

    [HttpPut("password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CurrentPassword) || string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest("Current and new passwords are required");

        if (req.NewPassword.Length < 8)
            return BadRequest("New password must be at least 8 characters");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _users.GetByIdAsync(userId!);
        if (user is null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return BadRequest("Current password is incorrect");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await _users.UpdateAsync(user);
        return Ok(new { message = "Password updated successfully" });
    }

    [HttpPost("avatar")]
    [Authorize]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest("No file provided");

        var allowedTypes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp" };
        if (!allowedTypes.Contains(file.ContentType.ToLowerInvariant()))
            return BadRequest("Only JPEG, PNG, GIF and WebP images are allowed");

        if (file.Length > 5 * 1024 * 1024)
            return BadRequest("Avatar must be smaller than 5 MB");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _users.GetByIdAsync(userId!);
        if (user is null) return NotFound();

        var containerName = _config["Auth:UsersContainer"] ?? "exstore-auth";
        var container = _blobServiceClient.GetBlobContainerClient(containerName);
        await container.CreateIfNotExistsAsync();

        var blobName = $"avatars/{userId}";
        var blob = container.GetBlobClient(blobName);

        using var stream = file.OpenReadStream();
        await blob.UploadAsync(stream, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = file.ContentType }
        });

        user.AvatarBlobName = blobName;
        await _users.UpdateAsync(user);
        return Ok(new { hasAvatar = true });
    }

    [HttpDelete("avatar")]
    [Authorize]
    public async Task<IActionResult> DeleteAvatar()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _users.GetByIdAsync(userId!);
        if (user is null) return NotFound();

        if (!string.IsNullOrEmpty(user.AvatarBlobName))
        {
            var containerName = _config["Auth:UsersContainer"] ?? "exstore-auth";
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            await container.GetBlobClient(user.AvatarBlobName).DeleteIfExistsAsync();
            user.AvatarBlobName = null;
            await _users.UpdateAsync(user);
        }

        return Ok(new { hasAvatar = false });
    }

    [HttpGet("avatar/{userId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAvatar(string userId)
    {
        var user = await _users.GetByIdAsync(userId);
        if (user is null || string.IsNullOrEmpty(user.AvatarBlobName))
            return NotFound();

        var containerName = _config["Auth:UsersContainer"] ?? "exstore-auth";
        var container = _blobServiceClient.GetBlobContainerClient(containerName);
        var blob = container.GetBlobClient(user.AvatarBlobName);

        if (!await blob.ExistsAsync()) return NotFound();

        var download = await blob.DownloadStreamingAsync();
        var contentType = download.Value.Details.ContentType ?? "image/jpeg";
        return File(download.Value.Content, contentType);
    }

    [HttpDelete("account")]
    [Authorize]
    public async Task<IActionResult> DeleteAccount()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _users.GetByIdAsync(userId!);
        if (user is null) return NotFound();

        var authContainerName = _config["Auth:UsersContainer"] ?? "exstore-auth";
        var filesContainerName = _config["AzureBlobStorage:ContainerName"]
            ?? _config["BlobStorage:ContainerName"]
            ?? "exstore-files";

        // 1. Delete all user files
        var filesContainer = _blobServiceClient.GetBlobContainerClient(filesContainerName);
        await foreach (var blob in filesContainer.GetBlobsAsync(prefix: $"{userId}/"))
            await filesContainer.GetBlobClient(blob.Name).DeleteIfExistsAsync();

        // 2. Delete avatar
        if (!string.IsNullOrEmpty(user.AvatarBlobName))
        {
            var authContainer = _blobServiceClient.GetBlobContainerClient(authContainerName);
            await authContainer.GetBlobClient(user.AvatarBlobName).DeleteIfExistsAsync();
        }

        // 3. Remove user's shares from shares.json
        var sharesContainer = _blobServiceClient.GetBlobContainerClient(authContainerName);
        var sharesBlob = sharesContainer.GetBlobClient("shares.json");
        if (await sharesBlob.ExistsAsync())
        {
            var download = await sharesBlob.DownloadContentAsync();
            var shares = System.Text.Json.JsonSerializer.Deserialize<List<ShareRecord>>(
                download.Value.Content,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
            var remaining = shares.Where(s => s.OwnerId != userId).ToList();
            var json = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(
                remaining, new System.Text.Json.JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            await sharesBlob.UploadAsync(new BinaryData(json), overwrite: true);
        }

        // 4. Delete user record
        await _users.DeleteAsync(userId!);

        return NoContent();
    }

    private string GenerateToken(User user)
    {
        var secret = _config["Jwt:Secret"]
            ?? throw new InvalidOperationException("Jwt:Secret is not configured");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Role, user.Role.ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"] ?? "ExStore",
            audience: _config["Jwt:Audience"] ?? "ExStore",
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    internal static UserDto ToDto(User u) => new()
    {
        Id = u.Id,
        Email = u.Email,
        Name = u.Name,
        Role = u.Role.ToString(),
        IsApproved = u.IsApproved,
        CreatedAt = u.CreatedAt,
        StorageQuotaGB = u.StorageQuotaGB,
        IsUploadLocked = u.IsUploadLocked,
        HasAvatar = !string.IsNullOrEmpty(u.AvatarBlobName)
    };
}
