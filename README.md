# ExStore - Personal Photo & Video Sharing Directory

ExStore is a full-stack web application for sharing photos and videos with family and friends. Built with React and .NET Core, with Azure Blob Storage for secure file management.

## Features

- 📸 Upload and manage photos and videos
- 👥 Share galleries with family and friends
- ☁️ Secure storage with Azure Blob Storage
- 🔐 User authentication and authorization
- 📱 Responsive design for all devices
- ⚡ High-performance API with .NET Core

## Tech Stack

### Frontend
- React 18+
- Vite (build tool)
- TypeScript
- Tailwind CSS
- Axios for API calls

### Backend
- .NET Core 8.0
- ASP.NET Core Web API
- Azure SDK for Blob Storage
- Entity Framework Core (optional)

### Infrastructure
- Azure Blob Storage
- Azure SQL Database (optional)

## Project Structure

```
ExStore/
├── frontend/          # React application
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/           # .NET Core API
│   ├── ExStore.API/
│   ├── ExStore.Core/
│   └── ExStore.sln
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- .NET SDK 8.0+
- Azure account with storage capability
- Git

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend will be available at `http://localhost:5173`

### Backend Setup
```bash
cd backend
dotnet restore
dotnet run --project ExStore.API
```
API will be available at `https://localhost:49820/`

### Environment Configuration

Create `frontend/.env.local`:
```
VITE_API_BASE_URL=http://localhost:49820
```

Create `backend/appsettings.Development.json`:
```json
{
  "BlobStorage": {
    "ConnectionString": "your-connection-string",
    "ContainerName": "exstore-files"
  }
}
```

## API Endpoints

- `GET /api/files` - List user's files
- `POST /api/files/upload` - Upload new file
- `DELETE /api/files/{id}` - Delete file
- `GET /api/galleries` - List shared galleries
- `POST /api/galleries` - Create new gallery
- `GET /api/galleries/{id}/share` - Get share link

## Development

Both frontend and backend support hot-reload for development.

### Frontend Development
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
```

### Backend Development
```bash
dotnet run       # Start development server
dotnet build     # Build project
dotnet test      # Run tests
```

## Azure Setup

1. Create an Azure Storage Account
2. Create a Blob Container named `exstore-files`
3. Get the connection string from Azure Portal
4. Add connection string to `appsettings.json`

## Contributing

This is a personal project, but improvements are welcome!

## License

MIT
