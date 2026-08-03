import { useCallback, useEffect, useRef, useState } from 'react'
import { fileService } from '../services/api'
import ShareModal from '../components/ShareModal'
import SecureImage from '../components/SecureImage'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

interface FileItem {
    fileName: string
    blobUri: string
    contentType: string
    size: number
    uploadedAt: string
    isDirectory: boolean
}

interface PagedResult {
    items: FileItem[]
    totalCount: number
    page: number
    pageSize: number
    totalPages: number
    storageUsedBytes: number
    storageQuotaBytes: number
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'
interface FileEntry { file: File; status: FileStatus; progress?: number; error?: string }

const STATUS_ICON: Record<FileStatus, string> = { pending: '⏳', uploading: '⬆️', done: '✅', error: '❌' }

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function displayName(fileName: string) {
    const afterSlash = fileName.includes('/') ? fileName.split('/').slice(1).join('/') : fileName
    return afterSlash.replace(/^[0-9a-f-]{36}_/i, '')
}

function lastName(path: string) {
    return path.split('/').filter(Boolean).pop() ?? path
}

function isImage(contentType: string, fileName: string) {
    return contentType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName)
}

function isVideo(contentType: string, fileName: string) {
    return contentType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName)
}

function isZip(contentType: string, fileName: string) {
    return ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/vnd.rar'].includes(contentType) ||
        (contentType === 'application/octet-stream' && /\.(zip|rar)$/i.test(fileName)) ||
        /\.(zip|rar)$/i.test(fileName)
}

async function triggerDownload(file: FileItem, token: string | null) {
    try {
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(file.blobUri, { headers, credentials: 'omit' })
        if (!response.ok) throw new Error(`${response.status}`)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = lastName(displayName(file.fileName))
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    } catch {
        /* silently fail */ }
}

export default function Home() {
    const { token } = useAuth()
    const [currentPath, setCurrentPath] = useState<string>('')
    const [result, setResult] = useState<PagedResult | null>(null)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [deleting, setDeleting] = useState(false)
    const [downloading, setDownloading] = useState(false)

    const [uploadOpen, setUploadOpen] = useState(false)
    const [entries, setEntries] = useState<FileEntry[]>([])
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    const [newDirName, setNewDirName] = useState('')
    const [newDirOpen, setNewDirOpen] = useState(false)
    const [creatingDir, setCreatingDir] = useState(false)

    const [sharingItem, setSharingItem] = useState<{ blobName: string; displayName: string; isDirectory: boolean } | null>(null)

    const [renamingItem, setRenamingItem] = useState<{ blobName: string; isDirectory: boolean; currentName: string } | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [renaming, setRenaming] = useState(false)

    const imageItems = result?.items.filter(f => !f.isDirectory && isImage(f.contentType, f.fileName)) ?? []

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const res = await fileService.getFiles(page, pageSize, currentPath || undefined)
            setResult(res.data)
        } catch {
            setError('Failed to load files.')
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, currentPath])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        if (lightboxIndex === null) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLightboxIndex(null)
            if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? Math.min(imageItems.length - 1, i + 1) : null)
            if (e.key === 'ArrowLeft') setLightboxIndex(i => i !== null ? Math.max(0, i - 1) : null)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [lightboxIndex, imageItems.length])

    const navigateTo = (path: string) => {
        setCurrentPath(path); setPage(1)
        setSelected(new Set()); setSelectMode(false)
    }

    const breadcrumbs = (): { label: string; path: string }[] => {
        const parts = currentPath.split('/').filter(Boolean)
        const crumbs = [{ label: 'Home', path: '' }]
        parts.forEach((p, i) => crumbs.push({ label: p, path: parts.slice(0, i + 1).join('/') }))
        return crumbs
    }

    const handleCardClick = (file: FileItem, imgIdx: number) => {
        if (selectMode) { toggleSelect(file.fileName); return }
        if (file.isDirectory) {
            const relativePath = file.fileName.split('/').slice(1).join('/')
            navigateTo(relativePath)
            return
        }
        if (isImage(file.contentType, file.fileName)) setLightboxIndex(imgIdx)
        else triggerDownload(file, token)
    }

    const toggleSelect = (name: string) =>
        setSelected(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

    const toggleSelectAll = () => {
        if (!result) return
        setSelected(selected.size === result.items.length
            ? new Set()
            : new Set(result.items.map(f => f.fileName)))
    }

    const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

    const handleDelete = async () => {
        if (selected.size === 0) return
        if (!confirm(`Delete ${selected.size} item${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
        setDeleting(true)
        try {
            await Promise.all([...selected].map(name => {
                const isDir = result?.items.find(f => f.fileName === name)?.isDirectory
                return fileService.deleteFile(isDir ? name + '/' : name)
            }))
            setSelected(new Set()); setSelectMode(false)
            await load()
        } catch { setError('Some items could not be deleted.') }
        finally { setDeleting(false) }
    }

    const handleDownload = async () => {
        if (!result || selected.size === 0) return
        setDownloading(true)
        const files = result.items.filter(f => selected.has(f.fileName) && !f.isDirectory)
        for (const file of files) { await triggerDownload(file, token); await new Promise(r => setTimeout(r, 400)) }
        setDownloading(false)
    }

    const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
        setEntries(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))

    const addFiles = (files: File[]) => {
        if (files.length === 0) return
        setEntries(prev => [...prev, ...files.map(f => ({ file: f, status: 'pending' as FileStatus }))])
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        addFiles(Array.from(e.target.files ?? [])); e.target.value = ''
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        addFiles(Array.from(e.dataTransfer.files))
    }

    const removeEntry = (i: number) => setEntries(prev => prev.filter((_, idx) => idx !== i))

    const handleUpload = async () => {
        const pending = entries.filter(en => en.status === 'pending' || en.status === 'error')
        if (pending.length === 0) return
        setUploading(true)
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            if (entry.status !== 'pending' && entry.status !== 'error') continue
            updateEntry(i, { status: 'uploading', error: undefined, progress: 0 })
            try {
                const formData = new FormData()
                const relativePath = (entry.file as File & { webkitRelativePath?: string }).webkitRelativePath
                const uploadName = relativePath && relativePath.includes('/') ? relativePath : entry.file.name
                formData.append('file', entry.file, uploadName)
                await fileService.uploadFile(formData, pct => updateEntry(i, { progress: pct }), currentPath || undefined)
                updateEntry(i, { status: 'done', progress: 100 })
            } catch {
                updateEntry(i, { status: 'error', error: 'Upload failed' })
            }
        }
        setUploading(false)
        await load()
    }

    const pendingCount = entries.filter(e => e.status === 'pending' || e.status === 'error').length
    const doneCount = entries.filter(e => e.status === 'done').length

    const handleCreateDir = async () => {
        const name = newDirName.trim()
        if (!name) return
        setCreatingDir(true)
        try {
            await fileService.createDirectory(name, currentPath || undefined)
            setNewDirName(''); setNewDirOpen(false)
            await load()
        } catch { setError('Failed to create directory.') }
        finally { setCreatingDir(false) }
    }

    const openRename = (file: FileItem, name: string) => {
        setRenamingItem({
            blobName: file.isDirectory ? file.fileName.replace(/\/$/, '') : file.fileName,
            isDirectory: file.isDirectory,
            currentName: name,
        })
        setRenameValue(name)
    }

    const handleRename = async () => {
        if (!renamingItem) return
        const newName = renameValue.trim()
        if (!newName || newName === renamingItem.currentName) { setRenamingItem(null); return }
        setRenaming(true)
        try {
            await fileService.renameItem(renamingItem.blobName, newName, renamingItem.isDirectory)
            setRenamingItem(null)
            await load()
        } catch { setError('Failed to rename item.') }
        finally { setRenaming(false) }
    }

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1); setSelected(new Set()) }

    const renderPagination = () => {
        if (!result || result.totalPages <= 1) return null
        const pages: number[] = []
        const start = Math.max(1, page - 2), end = Math.min(result.totalPages, page + 2)
        for (let i = start; i <= end; i++) pages.push(i)
        return (
            <div className="flex items-center justify-center gap-1 mt-8">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-300 transition">&#8249; Prev</button>
                {start > 1 && <span className="px-2 text-slate-300">…</span>}
                {pages.map(p => (
                    <button key={p} onClick={() => setPage(p)}
                        className={`w-9 h-9 rounded-xl border text-sm font-medium transition ${
                            p === page
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                        }`}>
                        {p}
                    </button>
                ))}
                {end < result.totalPages && <span className="px-2 text-slate-300">…</span>}
                <button onClick={() => setPage(p => Math.min(result.totalPages, p + 1))} disabled={page === result.totalPages}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-300 transition">Next &#8250;</button>
            </div>
        )
    }

    const currentLightboxImage = lightboxIndex !== null ? imageItems[lightboxIndex] : null
    const crumbs = breadcrumbs()

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">

            {/* Selection Banner */}
            {selectMode && (
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5 px-5 py-3 bg-slate-900 text-white rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="font-semibold text-sm">Select Mode</span>
                        {selected.size > 0 && (
                            <span className="bg-white text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full">{selected.size} selected</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={toggleSelectAll}
                            className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg border border-white/10 transition">
                            {result && selected.size === result.items.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {selected.size > 0 && <>
                            <button onClick={handleDownload} disabled={downloading}
                                className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition">
                                {downloading ? 'Downloading…' : `Download (${selected.size})`}
                            </button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition">
                                {deleting ? 'Deleting…' : `Delete (${selected.size})`}
                            </button>
                        </>}
                        <button onClick={exitSelectMode}
                            className="px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/15 rounded-lg border border-white/10 transition">Cancel</button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5 bg-gradient-to-br from-indigo-50 via-violet-50/50 to-slate-50 border border-indigo-100/70 rounded-2xl px-5 pt-5 pb-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">ExStore</h1>
                    {result && (() => {
                        const pct = result.storageQuotaBytes > 0
                            ? Math.min(100, (result.storageUsedBytes / result.storageQuotaBytes) * 100) : 0
                        const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                        const textColor = pct > 90 ? 'text-red-600' : pct > 70 ? 'text-yellow-600' : 'text-indigo-600'
                        return (
                            <div className="mt-2 w-64">
                                <div className="flex justify-between items-baseline mb-1.5">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Storage</span>
                                    <span className={`text-sm font-bold ${textColor}`}>{pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct.toFixed(1)}%` }} />
                                </div>
                                <div className="flex justify-between text-xs text-slate-400 mt-1">
                                    <span>{formatBytes(result.storageUsedBytes)} used</span>
                                    <span>{formatBytes(result.storageQuotaBytes)} total</span>
                                </div>
                            </div>
                        )
                    })()}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setUploadOpen(o => !o)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm ${
                            uploadOpen
                                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                : 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-100 hover:shadow-indigo-200'
                        }`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4-4 4M12 8v8" />
                        </svg>
                        {uploadOpen ? 'Hide Upload' : 'Upload'}
                    </button>

                    <button onClick={() => setNewDirOpen(o => !o)}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl shadow-sm shadow-amber-100 transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2z" />
                        </svg>
                        New Folder
                    </button>

                    {!selectMode && (
                        <button onClick={() => setSelectMode(true)}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white rounded-xl shadow-sm shadow-teal-100 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Select
                        </button>
                    )}

                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <span>Show</span>
                        <select value={pageSize} onChange={e => handlePageSizeChange(Number(e.target.value))}
                            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white shadow-sm hover:border-slate-300 transition">
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* New folder inline form */}
            {newDirOpen && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                    </div>
                    <input autoFocus type="text" placeholder="Folder name"
                        value={newDirName}
                        onChange={e => setNewDirName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDir(); if (e.key === 'Escape') setNewDirOpen(false) }}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 transition"
                    />
                    <button onClick={handleCreateDir} disabled={!newDirName.trim() || creatingDir}
                        className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition">
                        {creatingDir ? '…' : 'Create'}
                    </button>
                    <button onClick={() => setNewDirOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1">×</button>
                </div>
            )}

            {/* Upload panel */}
            {uploadOpen && (
                <div className="mb-6 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 pt-4 pb-3.5 bg-gradient-to-r from-indigo-500 to-violet-600">
                        <p className="text-xs text-indigo-100 font-medium tracking-wide uppercase">Upload to
                            <span className="ml-1.5 font-bold text-white normal-case tracking-normal">/{currentPath || 'root'}</span>
                        </p>
                    </div>
                    <div className="p-5">
                    <div className="border-2 border-dashed border-indigo-200 rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all mb-3 group"
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
                        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 flex items-center justify-center group-hover:from-indigo-100 group-hover:to-violet-200 transition-all">
                            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4-4 4M12 8v8" />
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-indigo-600 mb-0.5">Click or drag files here</p>
                        <p className="text-xs text-slate-400">Images, Videos, PDFs, Docs, Text, ZIP & RAR</p>
                        <input ref={fileInputRef} type="file" multiple onChange={handleFileChange}
                            accept="image/*,video/*,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain,.zip,.rar,application/zip,application/x-zip-compressed,application/x-rar-compressed,application/vnd.rar"
                            className="hidden" />
                    </div>

                    <button onClick={() => folderInputRef.current?.click()}
                        className="flex items-center gap-2 mb-4 px-3 py-1.5 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 text-slate-600 transition">
                        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                        Upload folder
                        <input ref={folderInputRef} type="file" multiple onChange={handleFileChange} className="hidden"
                            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} />
                    </button>

                    {entries.length > 0 && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-slate-700">
                                    {entries.length} file{entries.length !== 1 ? 's' : ''}{doneCount > 0 && ` · ${doneCount} uploaded`}
                                </span>
                                {!uploading && <button onClick={() => setEntries([])} className="text-xs text-slate-400 hover:text-red-500 transition">Clear all</button>}
                            </div>
                            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                                {entries.map((entry, i) => (
                                    <li key={i} className={`px-4 py-2 text-sm transition-colors
                                        ${entry.status === 'done' ? 'bg-emerald-50' : ''}
                                        ${entry.status === 'error' ? 'bg-red-50' : ''}
                                        ${entry.status === 'uploading' ? 'bg-indigo-50' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 shrink-0">{STATUS_ICON[entry.status]}</span>
                                            <span className="flex-1 truncate text-slate-700" title={entry.file.name}>{entry.file.name}</span>
                                            <span className="text-slate-400 text-xs shrink-0">{formatBytes(entry.file.size)}</span>
                                            {entry.status === 'uploading' && entry.progress !== undefined && (
                                                <span className="text-indigo-600 text-xs font-medium shrink-0">
                                                    {entry.progress < 100 ? `${entry.progress}%` : 'Processing…'}
                                                </span>
                                            )}
                                            {entry.error && <span className="text-red-500 text-xs shrink-0">{entry.error}</span>}
                                            {entry.status !== 'uploading' && !uploading && (
                                                <button onClick={() => removeEntry(i)} className="text-slate-300 hover:text-red-400 transition text-base leading-none shrink-0">×</button>
                                            )}
                                        </div>
                                        {entry.status === 'uploading' && entry.progress !== undefined && (
                                            <div className="mt-1.5 h-1.5 w-full bg-indigo-100 rounded-full overflow-hidden">
                                                {entry.progress < 100
                                                    ? <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-200" style={{ width: `${entry.progress}%` }} />
                                                    : <div className="h-full w-full bg-indigo-400 rounded-full animate-pulse" />}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <button onClick={handleUpload} disabled={uploading || pendingCount === 0}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white py-2.5 px-4 rounded-xl font-semibold shadow-md shadow-indigo-100 hover:shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                        {uploading
                            ? (<><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Uploading… ({doneCount} / {entries.length})</>)
                            : pendingCount > 0 ? `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}` : '✅ All files uploaded'}
                    </button>
                    </div>
                </div>
            )}

            {/* Breadcrumb */}
            {crumbs.length > 1 && (
                <nav className="flex items-center gap-1.5 text-sm mb-4 flex-wrap bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                    {crumbs.map((c, i) => (
                        <span key={c.path} className="flex items-center gap-1">
                            {i > 0 && <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
                            {i < crumbs.length - 1 ? (
                                <button onClick={() => navigateTo(c.path)}
                                    className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition">{c.label}</button>
                            ) : (
                                <span className="text-slate-700 font-semibold">{c.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            )}

            {result && (
                <p className="text-sm text-slate-400 mb-4">
                    {result.totalCount} item{result.totalCount !== 1 ? 's' : ''}
                    {currentPath ? <span className="text-indigo-500"> in /{currentPath}</span> : ''}
                </p>
            )}

            {error && <div className="mb-4 p-3.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-center gap-2"><svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>{error}</div>}

            {loading && (
                <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm font-medium">Loading…</span>
                </div>
            )}

            {!loading && !error && result?.items.length === 0 && (
                <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-slate-200">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 flex items-center justify-center">
                        <svg className="w-8 h-8 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                    </div>
                    <p className="text-slate-700 font-semibold mb-1">This folder is empty</p>
                    <p className="text-sm text-slate-400">Upload files or create a folder to get started</p>
                </div>
            )}

            {!loading && !error && result && result.items.length > 0 && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {result.items.map((file, i) => {
                            const imgIdx = imageItems.indexOf(file)
                            const isSelected = selected.has(file.fileName)
                            const name = file.isDirectory ? lastName(file.fileName) : lastName(displayName(file.fileName))

                            return (
                                <div key={i} onClick={() => handleCardClick(file, imgIdx)}
                                    className={`group relative bg-white rounded-2xl transition-all cursor-pointer border overflow-hidden
                                        hover:shadow-md hover:-translate-y-0.5
                                        ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-200 shadow-md shadow-indigo-100' : 'border-slate-200 shadow-sm hover:border-slate-300'}`}>
                                    {selectMode && (
                                        <div className="absolute top-2 left-2 z-10">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-sm
                                                ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white/90 border-slate-300'}`}>
                                                {isSelected && (
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                                        {file.isDirectory ? (
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
                                                <svg className="w-7 h-7 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M10 4H2v16h20V6H12l-2-2z" />
                                                </svg>
                                            </div>
                                        ) : isImage(file.contentType, file.fileName) ? (
                                            <SecureImage src={file.blobUri} alt={name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                        ) : isVideo(file.contentType, file.fileName) ? (
                                            <div className="text-center">
                                                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-1">
                                                    <svg className="w-6 h-6 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                                    </svg>
                                                </div>
                                                <p className="text-xs text-violet-500 font-medium">Video</p>
                                            </div>
                                        ) : isZip(file.contentType, file.fileName) ? (
                                            <div className="text-center">
                                                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center mb-1">
                                                    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                                                    </svg>
                                                </div>
                                                <p className="text-xs text-amber-500 font-medium">Archive</p>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center mb-1">
                                                    <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                </div>
                                                <p className="text-xs text-sky-500 font-medium">File</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="px-2.5 py-2 border-t border-slate-100">
                                        <div className="flex items-start justify-between gap-1">
                                            <div className="min-w-0">
                                                <p className="text-xs text-slate-700 truncate font-medium" title={name}>{name}</p>
                                                {!file.isDirectory && <p className="text-xs text-slate-400 mt-0.5">{formatBytes(file.size)}</p>}
                                            </div>
                                            <div className="flex items-center gap-0.5 shrink-0 -mr-0.5">
                                            <button
                                                onClick={e => { e.stopPropagation(); openRename(file, name) }}
                                                className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition mt-0.5"
                                                title="Rename">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); setSharingItem({ blobName: file.isDirectory ? file.fileName.replace(/\/$/, '') : file.fileName, displayName: name, isDirectory: file.isDirectory }) }}
                                                className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition -mr-0.5 mt-0.5"
                                                title="Share">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                                </svg>
                                            </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {renderPagination()}
                    <p className="text-center text-xs text-slate-400 mt-3">Page {result.page} of {result.totalPages}</p>
                </>
            )}

            {/* Lightbox */}
            {currentLightboxImage && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
                    onClick={() => setLightboxIndex(null)}>
                    <button onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 text-white text-4xl leading-none hover:text-gray-300 z-10">×</button>
                    {lightboxIndex! > 0 && (
                        <button onClick={e => { e.stopPropagation(); setLightboxIndex(i => i! - 1) }}
                            className="absolute left-4 text-white text-5xl hover:text-gray-300 z-10 select-none px-2">‹</button>
                    )}
                    <div onClick={e => e.stopPropagation()}>
                        <SecureImage src={currentLightboxImage.blobUri} alt={displayName(currentLightboxImage.fileName)}
                            className="max-w-[90vw] max-h-[85vh] object-contain rounded shadow-2xl" />
                    </div>
                    {lightboxIndex! < imageItems.length - 1 && (
                        <button onClick={e => { e.stopPropagation(); setLightboxIndex(i => i! + 1) }}
                            className="absolute right-4 text-white text-5xl hover:text-gray-300 z-10 select-none px-2">›</button>
                    )}
                    <div className="absolute bottom-4 text-center w-full text-white text-sm opacity-70 pointer-events-none">
                        {displayName(currentLightboxImage.fileName)} · {formatBytes(currentLightboxImage.size)}
                        <span className="ml-3 text-xs opacity-60">{lightboxIndex! + 1} / {imageItems.length}</span>
                    </div>
                </div>
            )}
            {/* Share Modal */}
            {sharingItem && (
                <ShareModal
                    blobName={sharingItem.blobName}
                    displayName={sharingItem.displayName}
                    isDirectory={sharingItem.isDirectory}
                    onClose={() => setSharingItem(null)}
                />
            )}

            {/* Rename Modal */}
            {renamingItem && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                    onClick={() => !renaming && setRenamingItem(null)}>
                    <div onClick={e => e.stopPropagation()}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                </svg>
                            </div>
                            <h3 className="text-base font-semibold text-slate-800">
                                Rename {renamingItem.isDirectory ? 'folder' : 'file'}
                            </h3>
                        </div>
                        <input autoFocus type="text" value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenamingItem(null) }}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 transition"
                        />
                        <div className="flex items-center justify-end gap-2 mt-4">
                            <button onClick={() => setRenamingItem(null)} disabled={renaming}
                                className="px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={handleRename}
                                disabled={renaming || !renameValue.trim() || renameValue.trim() === renamingItem.currentName}
                                className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition">
                                {renaming ? 'Renaming…' : 'Rename'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
