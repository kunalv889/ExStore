using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;

var builder = WebApplication.CreateBuilder(args);

// Remove upload size limits (individual file limits are enforced at the action level)
builder.Services.Configure<KestrelServerOptions>(o => o.Limits.MaxRequestBodySize = null);
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = long.MaxValue);

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
app.UseCors("AllowFrontend");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHttpsRedirection();
}
app.UseAuthorization();

app.MapControllers();

app.Run();
