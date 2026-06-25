# Project Structure

## Root Directory
```
ExStore/
├── frontend/              # React application
├── backend/               # .NET Core API
├── .github/               # GitHub configuration
├── README.md              # Project overview
├── DEVELOPMENT.md         # Development setup guide
├── AZURE_SETUP.md         # Azure configuration guide
└── .gitignore             # Git ignore rules
```

## Frontend Structure
```
frontend/
├── src/
│   ├── components/        # Reusable React components
│   │   └── Navigation.tsx
│   ├── pages/             # Page components
│   │   ├── Home.tsx
│   │   ├── Gallery.tsx
│   │   └── Upload.tsx
│   ├── services/          # API service layer
│   │   └── api.ts
│   ├── App.tsx            # Root component
│   ├── main.tsx           # Application entry point
│   └── index.css          # Global styles
├── index.html             # HTML template
├── package.json           # Dependencies
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── postcss.config.js      # PostCSS configuration
└── .env.local             # Environment variables
```

## Backend Structure
```
backend/
├── ExStore.API/
│   ├── Controllers/       # API endpoints
│   │   ├── FilesController.cs
│   │   └── GalleriesController.cs
│   ├── Models/            # Data models
│   │   ├── FileModel.cs
│   │   └── GalleryModel.cs
│   ├── Program.cs         # Application configuration
│   ├── appsettings.json   # Production configuration
│   └── appsettings.Development.json
├── ExStore.sln            # Solution file
```

## Configuration Files

### Frontend
- `package.json` - NPM dependencies
- `vite.config.ts` - Build configuration
- `tsconfig.json` - TypeScript settings
- `tailwind.config.js` - Tailwind CSS themes
- `.env.local` - Local environment variables

### Backend
- `ExStore.API.csproj` - Project configuration
- `appsettings.json` - Production settings
- `appsettings.Development.json` - Development settings

## Key Features by Location

### Photo Upload
- Component: [frontend/src/pages/Upload.tsx](frontend/src/pages/Upload.tsx)
- API: [backend/ExStore.API/Controllers/FilesController.cs](backend/ExStore.API/Controllers/FilesController.cs)

### Gallery Management
- Component: [frontend/src/pages/Home.tsx](frontend/src/pages/Home.tsx)
- API: [backend/ExStore.API/Controllers/GalleriesController.cs](backend/ExStore.API/Controllers/GalleriesController.cs)

### Azure Integration
- Configuration: [backend/ExStore.API/appsettings.json](backend/ExStore.API/appsettings.json)
- Usage: [backend/ExStore.API/Controllers/FilesController.cs](backend/ExStore.API/Controllers/FilesController.cs)

## Environment Files

### Frontend (.env.local)
```
VITE_API_BASE_URL=http://localhost:49820/api
```

### Backend (appsettings.Development.json)
```json
{
  "AzureBlobStorage": {
    "ConnectionString": "UseDevelopmentStorage=true",
    "ContainerName": "exstore-files"
  }
}
```
