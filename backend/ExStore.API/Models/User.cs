namespace ExStore.API.Models;

public enum UserRole { User, Admin }

public class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.User;
    public bool IsApproved { get; set; } = false;
    public bool IsEmailVerified { get; set; } = false;
    public string? EmailVerificationToken { get; set; }
    public DateTime? EmailVerificationExpiry { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>Per-user storage quota in GB (default 5, min 1, max 100).</summary>
    public int StorageQuotaGB { get; set; } = 5;
    /// <summary>When true the user cannot upload new files.</summary>
    public bool IsUploadLocked { get; set; } = false;
    /// <summary>Blob name (relative) of the user's profile picture, or null if none.</summary>
    public string? AvatarBlobName { get; set; }
    /// <summary>
    /// Per-user AES-256 encryption key, wrapped (encrypted) with the application master key.
    /// Null for accounts created before encryption was enabled; a key will be lazily generated on first use.
    /// </summary>
    public string? EncryptedKey { get; set; }
}
