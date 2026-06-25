import axios from 'axios'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? window.location.origin : 'https://localhost:49820')).replace(/\/$/, '')

const api = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: {
        'Content-Type': 'application/json',
    }
})

export const fileService = {
    getFiles: () => api.get('/files'),
    uploadFile: (formData: FormData) => api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
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
