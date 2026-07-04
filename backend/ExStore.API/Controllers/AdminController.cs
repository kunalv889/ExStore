using ExStore.API.Models;
using ExStore.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ExStore.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly UserService _users;

    public AdminController(UserService users) => _users = users;

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
}
