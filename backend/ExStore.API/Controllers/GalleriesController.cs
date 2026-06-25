using ExStore.API.Models;
using Microsoft.AspNetCore.Mvc;

namespace ExStore.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GalleriesController : ControllerBase
{
    private readonly ILogger<GalleriesController> _logger;
    // In-memory storage for demo - replace with database
    private static List<GalleryModel> _galleries = new();

    public GalleriesController(ILogger<GalleriesController> logger)
    {
        _logger = logger;
        // Initialize with sample data
        if (_galleries.Count == 0)
        {
            _galleries.Add(new GalleryModel
            {
                Id = Guid.NewGuid().ToString(),
                Name = "Family Vacation",
                Description = "Summer 2024 vacation photos"
            });
        }
    }

    [HttpGet]
    public ActionResult<List<GalleryModel>> GetGalleries()
    {
        return Ok(_galleries);
    }

    [HttpGet("{id}")]
    public ActionResult<GalleryModel> GetGallery(string id)
    {
        var gallery = _galleries.FirstOrDefault(g => g.Id == id);
        if (gallery == null)
            return NotFound();

        return Ok(gallery);
    }

    [HttpPost]
    public ActionResult<GalleryModel> CreateGallery([FromBody] GalleryModel gallery)
    {
        if (string.IsNullOrEmpty(gallery.Name))
            return BadRequest("Gallery name is required");

        gallery.Id = Guid.NewGuid().ToString();
        gallery.CreatedAt = DateTime.UtcNow;
        _galleries.Add(gallery);

        return CreatedAtAction(nameof(GetGallery), new { id = gallery.Id }, gallery);
    }

    [HttpDelete("{id}")]
    public IActionResult DeleteGallery(string id)
    {
        var gallery = _galleries.FirstOrDefault(g => g.Id == id);
        if (gallery == null)
            return NotFound();

        _galleries.Remove(gallery);
        return NoContent();
    }

    [HttpPost("{id}/share")]
    public ActionResult<GalleryModel> ShareGallery(string id)
    {
        var gallery = _galleries.FirstOrDefault(g => g.Id == id);
        if (gallery == null)
            return NotFound();

        gallery.IsShared = true;
        gallery.ShareToken = Guid.NewGuid().ToString();

        return Ok(gallery);
    }
}
