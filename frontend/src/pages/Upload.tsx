import { useState } from 'react'
import { fileService } from '../services/api'

export default function Upload() {
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            setFile(selectedFile)
            setError(null)
        }
    }

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file) {
            setError('Please select a file')
            return
        }

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)

            await fileService.uploadFile(formData)
            setSuccess(true)
            setFile(null)
            setTimeout(() => setSuccess(false), 3000)
        } catch (err) {
            setError('Upload failed. Please try again.')
            console.error(err)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-8">Upload Photos, Videos & ZIPs</h1>

            <form onSubmit={handleUpload} className="bg-white rounded-lg shadow-md p-8">
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select File
                    </label>
                    <input
                        type="file"
                        onChange={handleFileChange}
                        accept="image/*,video/*,.zip,application/zip,application/x-zip-compressed"
                        className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
                    />
                    {file && <p className="mt-2 text-sm text-gray-600">{file.name}</p>}
                </div>

                {error && <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}
                {success && <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-md">File uploaded successfully!</div>}

                <button
                    type="submit"
                    disabled={uploading || !file}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {uploading ? 'Uploading...' : 'Upload File'}
                </button>
            </form>
        </div>
    )
}
