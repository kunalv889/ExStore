import axios from 'axios'

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env
const API_BASE_URL = ((viteEnv?.VITE_API_BASE_URL as string) || 'https://localhost:49820').toString().replace(/\/$/, '')

const api = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: { 'Content-Type': 'application/json' }
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
    const token = localStorage.getItem('auth_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// Auto-redirect to login on 401
api.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('auth_token')
            localStorage.removeItem('auth_user')
            window.location.href = '/login'
        }
        return Promise.reject(err)
    }
)

export const authService = {
    login: (email: string, password: string) =>
        api.post('/auth/login', { email, password }),
    register: (name: string, email: string, password: string) =>
        api.post('/auth/register', { name, email, password }),
    me: () => api.get('/auth/me'),
}

export const fileService = {
    getFiles: (page = 1, pageSize?: number, path?: string) =>
        api.get('/files', { params: { page, ...(pageSize !== undefined && { pageSize }), ...(path !== undefined && { path }) } }),
    uploadFile: (formData: FormData, onProgress?: (pct: number) => void, path?: string) =>
        api.post('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            params: path ? { path } : undefined,
            onUploadProgress: e => {
                if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
            },
            timeout: 0,
        }),
    deleteFile: (blobName: string) => {
        // Directories are deleted by their full prefix ending in '/'
        const encoded = blobName.split('/').map(encodeURIComponent).join('/')
        return api.delete(`/files/${encoded}`)
    },
    createDirectory: (name: string, path?: string) =>
        api.post('/files/directory', null, { params: { name, ...(path ? { path } : {}) } }),
}

export const adminService = {
    getUsers: () => api.get('/admin/users'),
    getPendingUsers: () => api.get('/admin/users/pending'),
    approveUser: (id: string) => api.post(`/admin/users/${id}/approve`),
    revokeUser: (id: string) => api.post(`/admin/users/${id}/revoke`),
    updateUserSettings: (id: string, storageQuotaGB: number, isUploadLocked: boolean) =>
        api.put(`/admin/users/${id}/settings`, { storageQuotaGB, isUploadLocked }),
}

export const galleryService = {
    getGalleries: () => api.get('/galleries'),
    getGallery: (id: string) => api.get(`/galleries/${id}`),
    createGallery: (data: any) => api.post('/galleries', data),
    deleteGallery: (id: string) => api.delete(`/galleries/${id}`),
    shareGallery: (id: string) => api.post(`/galleries/${id}/share`, {}),
}

// Separate axios instance for share access — no auto-redirect on 401
// (public share pages must handle 401 gracefully instead of forcing login)
const publicApi = axios.create({ baseURL: `${API_BASE_URL}/api` })
publicApi.interceptors.request.use(config => {
    const token = localStorage.getItem('auth_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

export const profileService = {
    updateProfile: (name: string) =>
        api.put('/auth/profile', { name }),
    changePassword: (currentPassword: string, newPassword: string) =>
        api.put('/auth/password', { currentPassword, newPassword }),
    uploadAvatar: (file: File) => {
        const form = new FormData()
        form.append('file', file)
        return api.post('/auth/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    deleteAvatar: () => api.delete('/auth/avatar'),
    deleteAccount: () => api.delete('/auth/account'),
    avatarUrl: (userId: string) => `${API_BASE_URL}/api/auth/avatar/${userId}`,
}

export const shareService = {
    /** All shares owned by the current user. Pass blobName to filter. */
    getMyShares: (blobName?: string) =>
        api.get('/shares', { params: blobName ? { blobName } : undefined }),
    /** Approved users available to share with (excludes self). */
    getShareableUsers: () => api.get('/shares/users'),
    /** Create or update a share. type = 'Public' | 'Internal'. allowedUserIds empty = all users. */
    createShare: (
        blobName: string,
        displayName: string,
        isDirectory: boolean,
        type: 'Public' | 'Internal',
        allowedUserIds: string[] = []
    ) => api.post('/shares', { blobName, displayName, isDirectory, type, allowedUserIds }),
    /** Revoke a share by its ID. */
    revokeShare: (shareId: string) => api.delete(`/shares/${shareId}`),
    /** Resolve a share link. Works for public shares without auth. */
    accessShare: (shareId: string) => publicApi.get(`/shares/${shareId}/access`),
}

export default api
