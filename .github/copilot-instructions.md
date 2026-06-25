<!-- ExStore Project Configuration -->
# ExStore Project Instructions

ExStore is a personal photo and video sharing application built with React frontend and .NET Core backend, using Azure Blob Storage for data persistence.

## Project Stack
- **Frontend**: React 18+ with Vite
- **Backend**: .NET Core 8.0
- **Storage**: Azure Blob Storage
- **Database**: SQL Server (optional, for metadata)

## Setup Checklist

- [ ] Create React Frontend with Vite
- [ ] Create .NET Core Backend API
- [ ] Configure Azure Blob Storage credentials
- [ ] Install dependencies for both frontend and backend
- [ ] Verify project builds without errors
- [ ] Run development servers
- [ ] Test API connectivity

## Development Workflow

### Frontend (React)
```bash
cd frontend
npm install
npm run dev
```

### Backend (.NET Core)
```bash
cd backend
dotnet restore
dotnet run
```

### Environment Variables
Create `.env` files in both frontend and backend directories with Azure credentials.

## Key Features
- Photo/Video Upload
- Shared Gallery Access
- User Management
- Azure Blob Storage Integration
- Real-time File Management
