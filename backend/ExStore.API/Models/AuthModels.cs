namespace ExStore.API.Models;

public record LoginRequest(string Email, string Password);
public record RegisterRequest(string Email, string Name, string Password);

/// <summary>Admin-only: update per-user storage quota and upload lock.</summary>
public record UserSettingsRequest(
    int StorageQuotaGB,
    bool IsUploadLocked
);

public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsApproved { get; set; }
    public DateTime CreatedAt { get; set; }
    public int StorageQuotaGB { get; set; }
    public bool IsUploadLocked { get; set; }
}
