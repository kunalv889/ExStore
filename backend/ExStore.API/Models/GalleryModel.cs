namespace ExStore.API.Models;

public class GalleryModel
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<FileModel> Files { get; set; } = new();
    public bool IsShared { get; set; }
    public string? ShareToken { get; set; }
}
