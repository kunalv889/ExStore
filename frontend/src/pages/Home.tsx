import { useCallback, useEffect, useRef, useState } from 'react'
import { fileService } from '../services/api'

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

async function triggerDownload(file: FileItem) {
    try {
        const response = await fetch(file.blobUri)
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
        window.open(file.blobUri, '_blank')
    }
}

export default function Home() {
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
        if (file.isDirectory) {
            // Strip the userId prefix to get just the relative path
            const relativePath = file.fileName.split('/').slice(1).join('/')
            navigateTo(relativePath)
            return
        }
        if (selectMode) { toggleSelect(file.fileName); return }
        if (isImage(file.contentType, file.fileName)) setLightboxIndex(imgIdx)
        else window.open(file.blobUri, '_blank')
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
        for (const file of files) { await triggerDownload(file); await new Promise(r => setTimeout(r, 400)) }
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

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1); setSelected(new Set()) }

    const renderPagination = () => {
        if (!result || result.totalPages <= 1) return null
        const pages: number[] = []
        const start = Math.max(1, page - 2), end = Math.min(result.totalPages, page + 2)
        for (let i = start; i <= end; i++) pages.push(i)
        return (
            <div className="flex items-center justify-center gap-1 mt-8">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100">‹ Prev</button>
                {start > 1 && <span className="px-2 text-gray-400">…</span>}
                {pages.map(p => (
                    <button key={p} onClick={() => setPage(p)}
                        className={`w-9 h-9 rounded border text-sm ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-100'}`}>
                        {p}
                    </button>
                ))}
                {end < result.totalPages && <span className="px-2 text-gray-400">…</span>}
                <button onClick={() => setPage(p => Math.min(result.totalPages, p + 1))} disabled={page === result.totalPages}
                    className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100">Next ›</button>
            </div>
        )
    }

    const currentLightboxImage = lightboxIndex !== null ? imageItems[lightboxIndex] : null
    const crumbs = breadcrumbs()

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">

            {/* Selection Banner */}
            {selectMode && (
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 bg-blue-600 text-white rounded-xl shadow-md">
                    <div className="flex items-center gap-3">
                        <span className="font-semibold">Selection Mode</span>
                        {selected.size > 0 && (
                            <span className="bg-white text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">{selected.size} selected</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={toggleSelectAll}
                            className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 rounded-lg border border-white/30 transition">
                            {result && selected.size === result.items.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {selected.size > 0 && <>
                            <button onClick={handleDownload} disabled={downloading}
                                className="px-3 py-1.5 text-sm bg-white text-blue-600 font-medium rounded-lg hover:bg-blue-50 disabled:opacity-50 transition">
                                {downloading ? 'Downloading…' : `Download (${selected.size})`}
                            </button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="px-3 py-1.5 text-sm bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition">
                                {deleting ? 'Deleting…' : `Delete (${selected.size})`}
                            </button>
                        </>}
                        <button onClick={exitSelectMode}
                            className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition">✕ Cancel</button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                    <h1 className="text-3xl font-bold">ExStore</h1>
                    {result && (() => {
                        const pct = result.storageQuotaBytes > 0
                            ? Math.min(100, (result.storageUsedBytes / result.storageQuotaBytes) * 100) : 0
                        const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                        const textColor = pct > 90 ? 'text-red-600' : pct > 70 ? 'text-yellow-600' : 'text-blue-600'
                        return (
                            <div className="mt-2 w-60">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-sm font-medium text-gray-600">Storage</span>
                                    <span className={`text-sm font-semibold ${textColor}`}>{pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct.toFixed(1)}%` }} />
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                                    <span>{formatBytes(result.storageUsedBytes)} used</span>
                                    <span>{formatBytes(result.storageQuotaBytes)} quota</span>
                                </div>
                            </div>
                        )
                    })()}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setUploadOpen(o => !o)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg shadow transition ${uploadOpen ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4-4 4M12 8v8" />
                        </svg>
                        {uploadOpen ? 'Hide Upload' : 'Upload'}
                    </button>

                    <button onClick={() => setNewDirOpen(o => !o)}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition text-gray-700">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2z" />
                        </svg>
                        New Folder
                    </button>

                    {!selectMode && (
                        <button onClick={() => setSelectMode(true)}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition text-gray-700">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Select
                        </button>
                    )}

                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <span>Show</span>
                        <select value={pageSize} onChange={e => handlePageSizeChange(Number(e.target.value))}
                            className="border border-gray-300 rounded px-2 py-1 text-sm">
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* New folder inline form */}
            {newDirOpen && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <svg className="w-5 h-5 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                    <input autoFocus type="text" placeholder="Folder name"
                        value={newDirName}
                        onChange={e => setNewDirName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDir(); if (e.key === 'Escape') setNewDirOpen(false) }}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button onClick={handleCreateDir} disabled={!newDirName.trim() || creatingDir}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                        {creatingDir ? '…' : 'Create'}
                    </button>
                    <button onClick={() => setNewDirOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">×</button>
                </div>
            )}

            {/* Upload panel */}
            {uploadOpen && (
                <div className="mb-6 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                    <p className="text-xs text-gray-400 mb-3">
                        Uploading into: <span className="font-medium text-gray-600">/{currentPath || ''}</span>
                    </p>
                    <div className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition mb-3"
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
                        <div className="text-3xl mb-1">📁</div>
                        <p className="text-sm font-medium text-blue-600">Click or drag files here</p>
                        <p className="text-xs text-gray-400 mt-0.5">Images, Videos, ZIP & RAR · Multiple files</p>
                        <input ref={fileInputRef} type="file" multiple onChange={handleFileChange}
                            accept="image/*,video/*,.zip,.rar,application/zip,application/x-zip-compressed,application/x-rar-compressed,application/vnd.rar"
                            className="hidden" />
                    </div>

                    <button onClick={() => folderInputRef.current?.click()}
                        className="flex items-center gap-2 mb-4 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                        Upload folder
                        <input ref={folderInputRef} type="file" multiple onChange={handleFileChange} className="hidden"
                            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} />
                    </button>

                    {entries.length > 0 && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-gray-700">
                                    {entries.length} file{entries.length !== 1 ? 's' : ''}{doneCount > 0 && ` · ${doneCount} uploaded`}
                                </span>
                                {!uploading && <button onClick={() => setEntries([])} className="text-xs text-gray-400 hover:text-red-500 transition">Clear all</button>}
                            </div>
                            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                                {entries.map((entry, i) => (
                                    <li key={i} className={`px-4 py-2 text-sm
                                        ${entry.status === 'done' ? 'bg-green-50' : ''}
                                        ${entry.status === 'error' ? 'bg-red-50' : ''}
                                        ${entry.status === 'uploading' ? 'bg-blue-50' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 shrink-0">{STATUS_ICON[entry.status]}</span>
                                            <span className="flex-1 truncate text-gray-700" title={entry.file.name}>{entry.file.name}</span>
                                            <span className="text-gray-400 text-xs shrink-0">{formatBytes(entry.file.size)}</span>
                                            {entry.status === 'uploading' && entry.progress !== undefined && (
                                                <span className="text-blue-600 text-xs font-medium shrink-0">
                                                    {entry.progress < 100 ? `${entry.progress}%` : 'Processing…'}
                                                </span>
                                            )}
                                            {entry.error && <span className="text-red-500 text-xs shrink-0">{entry.error}</span>}
                                            {entry.status !== 'uploading' && !uploading && (
                                                <button onClick={() => removeEntry(i)} className="text-gray-300 hover:text-red-400 transition text-base leading-none shrink-0">×</button>
                                            )}
                                        </div>
                                        {entry.status === 'uploading' && entry.progress !== undefined && (
                                            <div className="mt-1.5 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                                                {entry.progress < 100
                                                    ? <div className="h-full bg-blue-500 rounded-full transition-all duration-200" style={{ width: `${entry.progress}%` }} />
                                                    : <div className="h-full w-full bg-blue-400 rounded-full animate-pulse" />}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <button onClick={handleUpload} disabled={uploading || pendingCount === 0}
                        className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                        {uploading
                            ? `Uploading… (${doneCount} / ${entries.length})`
                            : pendingCount > 0 ? `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}` : 'All files uploaded'}
                    </button>
                </div>
            )}

            {/* Breadcrumb */}
            {crumbs.length > 1 && (
                <nav className="flex items-center gap-1 text-sm mb-3 flex-wrap">
                    {crumbs.map((c, i) => (
                        <span key={c.path} className="flex items-center gap-1">
                            {i > 0 && <span className="text-gray-300">/</span>}
                            {i < crumbs.length - 1 ? (
                                <button onClick={() => navigateTo(c.path)} className="text-blue-600 hover:underline">{c.label}</button>
                            ) : (
                                <span className="text-gray-700 font-medium">{c.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            )}

            {result && (
                <p className="text-sm text-gray-400 mb-4">
                    {result.totalCount} item{result.totalCount !== 1 ? 's' : ''}
                    {currentPath ? ` in /${currentPath}` : ''}
                </p>
            )}

            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            {loading && <div className="text-center py-20 text-gray-400">Loading…</div>}

            {!loading && !error && result?.items.length === 0 && (
                <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
                    <p className="text-4xl mb-2">📂</p>
                    <p className="text-gray-500 font-medium">This folder is empty</p>
                    <p className="text-sm text-gray-400 mt-1">Upload files or create a folder to get started</p>
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
                                    className={`group relative bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden cursor-pointer border
                                        ${isSelected ? 'ring-2 ring-blue-500 border-blue-200' : 'border-gray-100'}`}>
                                    {selectMode && (
                                        <div className="absolute top-2 left-2 z-10">
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center
                                                ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400'}`}>
                                                {isSelected && (
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                                        {file.isDirectory ? (
                                            <div className="text-5xl">📁</div>
                                        ) : isImage(file.contentType, file.fileName) ? (
                                            <img src={file.blobUri} alt={name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                                        ) : isVideo(file.contentType, file.fileName) ? (
                                            <div className="text-center text-gray-400"><div className="text-3xl mb-1">🎬</div><div className="text-xs">Video</div></div>
                                        ) : isZip(file.contentType, file.fileName) ? (
                                            <div className="text-center text-gray-400"><div className="text-3xl mb-1">📦</div><div className="text-xs">Archive</div></div>
                                        ) : (
                                            <div className="text-center text-gray-400"><div className="text-3xl mb-1">📄</div><div className="text-xs">File</div></div>
                                        )}
                                    </div>
                                    <div className="p-2">
                                        <p className="text-xs text-gray-700 truncate font-medium" title={name}>{name}</p>
                                        {!file.isDirectory && <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {renderPagination()}
                    <p className="text-center text-xs text-gray-400 mt-3">Page {result.page} of {result.totalPages}</p>
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
                    <img src={currentLightboxImage.blobUri} alt={displayName(currentLightboxImage.fileName)}
                        className="max-w-[90vw] max-h-[85vh] object-contain rounded shadow-2xl"
                        onClick={e => e.stopPropagation()} />
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
        </div>
    )
}
