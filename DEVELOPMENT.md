# Development Setup Guide

## Prerequisites

- Node.js 18+ (for React frontend)
- .NET SDK 8.0 (for backend)
- Git
- Azure account (for Blob Storage)

## Frontend Setup

### Install Dependencies
```bash
cd frontend
npm install
```

### Environment Configuration
The `.env.local` file is already configured to point to the local backend API:
```
VITE_API_BASE_URL=https://localhost:49820/api
```

### Run Development Server
```bash
npm run dev
```
The frontend will be available at `http://localhost:5173`

### Build for Production
```bash
npm run build
```

## Backend Setup

### Install Dependencies
```bash
cd backend
dotnet restore
```

### Configure Azure
1. Follow the [Azure Setup Guide](./AZURE_SETUP.md)
2. Update `appsettings.Development.json` with your Azure connection string
3. Or use Azure Storage Emulator for local development

### Run Development Server
```bash
cd backend
dotnet run --project ExStore.API
```
The API will be available at `https://localhost:49820`

Swagger documentation available at `https://localhost:49820/swagger/index.html`

## Running Both Simultaneously

### Option 1: Two Terminal Windows
- Terminal 1: `cd frontend && npm run dev`
- Terminal 2: `cd backend && dotnet run --project ExStore.API`

### Option 2: Using VS Code Terminal Splitting
1. Open VS Code integrated terminal
2. Press Ctrl+Shift+5 to split terminal
3. Run both commands in separate panes

## API Endpoints

### Files
- `GET /api/files` - List all files
- `POST /api/files/upload` - Upload a new file
- `DELETE /api/files/{id}` - Delete a file

### Galleries
- `GET /api/galleries` - List all galleries
- `GET /api/galleries/{id}` - Get specific gallery
- `POST /api/galleries` - Create new gallery
- `DELETE /api/galleries/{id}` - Delete gallery
- `POST /api/galleries/{id}/share` - Generate share token

## Common Issues

### CORS Error
If you see CORS errors, ensure:
1. Frontend is running on `http://localhost:5173`
2. Backend is running on `https://localhost:49820/`
3. API calls use the correct base URL

### Azure Connection Error
1. Check connection string is correct
2. Verify Azure Storage Account exists
3. Check network connectivity
4. For development, use Storage Emulator instead

### Port Already in Use
If ports 5000 or 5173 are already in use:
- Frontend: Update port in `vite.config.ts`
- Backend: Add `--urls "http://localhost:XXXX"` to `dotnet run`

## Database (Optional)

For data persistence beyond what Azure Blob Storage provides:
1. Create SQL Server database on Azure
2. Install Entity Framework Core
3. Add DbContext to backend
4. Run migrations

## Next Steps

1. Start both development servers
2. Navigate to `http://localhost:5173`
3. Try uploading a file through the web interface
4. Verify files appear in Azure Blob Storage container
5. Test file deletion

## Troubleshooting

Run diagnostics:
```bash
# Check Node.js version
node --version

# Check .NET SDK version
dotnet --version

# Test API connectivity
curl https://localhost:49820/api/galleries
```
