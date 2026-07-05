namespace ExStore.API.Models;

public class ShareRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerId { get; set; } = "";
    public string OwnerName { get; set; } = "";
    public string BlobName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool IsDirectory { get; set; }
    public string Type { get; set; } = "Internal"; // "Public" | "Internal"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CreateShareRequest
{
    public string BlobName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool IsDirectory { get; set; }
    public string Type { get; set; } = "Internal"; // "Public" | "Internal"
}
