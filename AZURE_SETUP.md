# Azure Blob Storage Setup Guide

## Prerequisites
- Azure account
- Azure Storage Account created
- Azure Storage Explorer (optional but recommended)

## Step 1: Create Azure Storage Account

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource"
3. Search for "Storage account" and click Create
4. Fill in the details:
   - Resource Group: Create new or use existing
   - Storage account name: `exstore{randomnumbers}` (must be unique)
   - Region: Choose closest to you
   - Performance: Standard
   - Redundancy: Locally-redundant storage (LRS)
5. Click "Review + Create"

## Step 2: Create a Container

1. In your Storage account, go to "Containers" under "Data storage"
2. Click "+ Container"
3. Name: `exstore-files`
4. Public access level: Private (recommended)
5. Click Create

## Step 3: Get Connection String

1. In Storage account, go to "Access keys"
2. Under "key1", click "Show" next to the connection string
3. Copy the entire connection string
4. Paste in `backend/ExStore.API/appsettings.Development.json`:
   ```json
   "BlobStorage": {
     "ConnectionString": "YOUR_CONNECTION_STRING_HERE",
     "ContainerName": "exstore-files"
   }
   ```

## Step 4: For Production

1. Use Azure Key Vault to store the connection string
2. Update `appsettings.json` with Key Vault reference
3. Never commit secrets to version control

## Using Azure Storage Emulator (Development)

For local development without Azure:
1. Install [Azure Storage Emulator](https://docs.microsoft.com/en-us/azure/storage/common/storage-use-emulator)
2. Start the emulator
3. Connection string is already set in `appsettings.Development.json`

## Testing Connection

Run the backend and test the `/api/files` endpoint:
```bash
curl https://localhost:49820/api/files
```

Should return an empty array initially (or an error if connection fails).
