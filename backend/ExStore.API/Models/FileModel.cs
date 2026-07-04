namespace ExStore.API.Models;

public class FileModel
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public string GalleryId { get; set; } = string.Empty;
    public string BlobUri { get; set; } = string.Empty;
    public bool IsDirectory { get; set; } = false;
}
