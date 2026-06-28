using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;

var builder = WebApplication.CreateBuilder(args);

// Remove upload size limits — streaming upload avoids disk buffering entirely
builder.Services.Configure<KestrelServerOptions>(o =>
{
    o.Limits.MaxRequestBodySize = null;        // no hard cap on request size
    o.Limits.MinRequestBodyDataRate = null;    // don't drop slow/large uploads
});

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
