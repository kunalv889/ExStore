using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Cors;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.OperationFilter<ExStore.API.Swagger.FileUploadOperationFilter>();
});

// Add CORS
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? new[] { "http://localhost:5173", "https://localhost:5173" };
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Add Azure Blob Storage
var connectionString = builder.Configuration["AzureBlobStorage:ConnectionString"]
    ?? builder.Configuration["BlobStorage:ConnectionString"];

if (string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddSingleton(_ => new BlobServiceClient("UseDevelopmentStorage=true"));
}
else
{
    builder.Services.AddSingleton(new BlobServiceClient(connectionString));
}

var app = builder.Build();

// Configure middleware
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("AllowFrontend");
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthorization();

app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
