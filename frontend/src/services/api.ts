import axios from 'axios'

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env
const API_BASE_URL = ((viteEnv?.VITE_API_BASE_URL as string) || 'https://localhost:49820').toString().replace(/\/$/, '')

const api = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: {
        'Content-Type': 'application/json',
    }
})

export const fileService = {
    getFiles: (page = 1, pageSize?: number) =>
        api.get('/files', { params: { page, ...(pageSize !== undefined && { pageSize }) } }),
    uploadFile: (formData: FormData, onProgress?: (pct: number) => void) =>
        api.post('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: e => {
                if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
            },
            timeout: 0, // no timeout for large uploads
        }),
    deleteFile: (id: string) => api.delete(`/files/${id}`),
}

export const galleryService = {
    getGalleries: () => api.get('/galleries'),
    getGallery: (id: string) => api.get(`/galleries/${id}`),
    createGallery: (data: any) => api.post('/galleries', data),
    deleteGallery: (id: string) => api.delete(`/galleries/${id}`),
    shareGallery: (id: string) => api.post(`/galleries/${id}/share`, {}),
}

export default api
