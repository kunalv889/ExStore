using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using ExStore.API.Models;
using System.Text.Json;

namespace ExStore.API.Services;

public class UserService
{
    private readonly BlobContainerClient _container;
    private const string BlobName = "users.json";

    public UserService(BlobServiceClient blobClient, IConfiguration config)
    {
        var containerName = config["Auth:UsersContainer"] ?? "exstore-auth";
        _container = blobClient.GetBlobContainerClient(containerName);
    }

    public async Task<List<User>> GetAllAsync()
    {
        await _container.CreateIfNotExistsAsync();
        var blob = _container.GetBlobClient(BlobName);
        if (!await blob.ExistsAsync()) return new();
        var resp = await blob.DownloadContentAsync();
        return JsonSerializer.Deserialize<List<User>>(resp.Value.Content) ?? new();
    }

    public async Task<User?> GetByEmailAsync(string email) =>
        (await GetAllAsync()).FirstOrDefault(u =>
            string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase));

    public async Task<User?> GetByIdAsync(string id) =>
        (await GetAllAsync()).FirstOrDefault(u => u.Id == id);

    /// <summary>Returns false if email is already taken.</summary>
    public async Task<bool> CreateAsync(User user)
    {
        var users = await GetAllAsync();
        if (users.Any(u => string.Equals(u.Email, user.Email, StringComparison.OrdinalIgnoreCase)))
            return false;
        users.Add(user);
        await SaveAsync(users);
        return true;
    }

    public async Task UpdateAsync(User updated)
    {
        var users = await GetAllAsync();
        var i = users.FindIndex(u => u.Id == updated.Id);
        if (i < 0) return;
        users[i] = updated;
        await SaveAsync(users);
    }

    public async Task DeleteAsync(string userId)
    {
        var users = await GetAllAsync();
        users.RemoveAll(u => u.Id == userId);
        await SaveAsync(users);
    }

    public async Task EnsureAdminAsync(string email, string password)
    {
        if (await GetByEmailAsync(email) != null) return;
        await CreateAsync(new User
        {
            Email = email.Trim().ToLower(),
            Name = "Admin",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = UserRole.Admin,
            IsApproved = true
        });
    }

    private async Task SaveAsync(List<User> users)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(users,
            new JsonSerializerOptions { WriteIndented = true });
        await _container.GetBlobClient(BlobName)
            .UploadAsync(new BinaryData(json), overwrite: true);
    }
}
