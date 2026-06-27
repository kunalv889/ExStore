import { useCallback, useEffect, useState } from 'react'
import { fileService } from '../services/api'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]

interface FileItem {
    fileName: string
    blobUri: string
    contentType: string
    size: number
    uploadedAt: string
}

interface PagedResult {
    items: FileItem[]
    totalCount: number
    page: number
    pageSize: number
    totalPages: number
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function displayName(fileName: string) {
    return fileName.replace(/^[0-9a-f-]{36}_/i, '')
}

function isImage(contentType: string, fileName: string) {
    return contentType.startsWith('image/') ||
        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName)
}

function isZip(contentType: string, fileName: string) {
    return contentType === 'application/zip' ||
        contentType === 'application/x-zip-compressed' ||
        (contentType === 'application/octet-stream' && /\.zip$/i.test(fileName)) ||
        /\.zip$/i.test(fileName)
}

async function triggerDownload(file: FileItem) {
    try {
        const response = await fetch(file.blobUri)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = displayName(file.fileName)
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    } catch {
        window.open(file.blobUri, '_blank')
    }
}

export default function Photos() {
    const [result, setResult] = useState<PagedResult | null>(null)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Lightbox
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

    // Selection
    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [deleting, setDeleting] = useState(false)
    const [downloading, setDownloading] = useState(false)

    // Images-only array for lightbox navigation
    const imageItems = result?.items.filter(f => isImage(f.contentType, f.fileName)) ?? []

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fileService.getFiles(page, pageSize)
            setResult(response.data)
        } catch {
            setError('Failed to load files. Please try again.')
        } finally {
            setLoading(false)
        }
    }, [page, pageSize])

    useEffect(() => { load() }, [load])

    // Keyboard navigation for lightbox
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

    const handleCardClick = (file: FileItem, imgIdx: number) => {
        if (selectMode) {
            toggleSelect(file.fileName)
        } else if (isImage(file.contentType, file.fileName)) {
            setLightboxIndex(imgIdx)
        } else {
            window.open(file.blobUri, '_blank')
        }
    }

    const toggleSelect = (fileName: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(fileName) ? next.delete(fileName) : next.add(fileName)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (!result) return
        setSelected(selected.size === result.items.length
            ? new Set()
            : new Set(result.items.map(f => f.fileName))
        )
    }

    const exitSelectMode = () => {
        setSelectMode(false)
        setSelected(new Set())
    }

    const handleDelete = async () => {
        if (selected.size === 0) return
        if (!confirm(`Delete ${selected.size} file${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
        setDeleting(true)
        try {
            await Promise.all([...selected].map(name => fileService.deleteFile(name)))
            setSelected(new Set())
            setSelectMode(false)
            await load()
        } catch {
            setError('Some files could not be deleted. Please try again.')
        } finally {
            setDeleting(false)
        }
    }

    const handleDownload = async () => {
        if (!result || selected.size === 0) return
        setDownloading(true)
        const files = result.items.filter(f => selected.has(f.fileName))
        for (const file of files) {
            await triggerDownload(file)
            await new Promise(r => setTimeout(r, 400))
        }
        setDownloading(false)
    }

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize)
        setPage(1)
        setSelected(new Set())
    }

    const renderPagination = () => {
        if (!result || result.totalPages <= 1) return null
        const pages: number[] = []
        const start = Math.max(1, page - 2)
        const end = Math.min(result.totalPages, page + 2)
        for (let i = start; i <= end; i++) pages.push(i)

        return (
            <div className="flex items-center justify-center gap-1 mt-8">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100">
                    ‹ Prev
                </button>
                {start > 1 && <span className="px-2 text-gray-400">…</span>}
                {pages.map(p => (
                    <button key={p} onClick={() => setPage(p)}
                        className={`w-9 h-9 rounded border text-sm ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-100'}`}>
                        {p}
                    </button>
                ))}
                {end < result.totalPages && <span className="px-2 text-gray-400">…</span>}
                <button onClick={() => setPage(p => Math.min(result.totalPages, p + 1))} disabled={page === result.totalPages}
                    className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100">
                    Next ›
                </button>
            </div>
        )
    }

    const currentLightboxImage = lightboxIndex !== null ? imageItems[lightboxIndex] : null

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">

            {/* Selection Mode Banner */}
            {selectMode && (
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 bg-blue-600 text-white rounded-xl shadow-md">
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-semibold tracking-wide">Selection Mode</span>
                        {selected.size > 0 && (
                            <span className="bg-white text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                {selected.size} selected
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={toggleSelectAll}
                            className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 text-white rounded-lg border border-white/30 transition">
                            {result && selected.size === result.items.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {selected.size > 0 && (
                            <>
                                <button onClick={handleDownload} disabled={downloading}
                                    className="px-3 py-1.5 text-sm bg-white text-blue-600 font-medium rounded-lg hover:bg-blue-50 disabled:opacity-50 transition">
                                    {downloading ? 'Downloading…' : `Download (${selected.size})`}
                                </button>
                                <button onClick={handleDelete} disabled={deleting}
                                    className="px-3 py-1.5 text-sm bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition">
                                    {deleting ? 'Deleting…' : `Delete (${selected.size})`}
                                </button>
                            </>
                        )}
                        <button onClick={exitSelectMode}
                            className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition">
                            ✕ Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-4xl font-bold">All Files</h1>
                    {result && (
                        <p className="text-gray-500 mt-1">
                            {result.totalCount} file{result.totalCount !== 1 ? 's' : ''} total
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Show</span>
                        <select value={pageSize} onChange={e => handlePageSizeChange(Number(e.target.value))}
                            className="border border-gray-300 rounded px-2 py-1 text-sm">
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <span>per page</span>
                    </div>
                    {!selectMode && (
                        <div className="flex flex-col items-end gap-1">
                            <button
                                onClick={() => setSelectMode(true)}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 active:bg-blue-800 transition"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Select
                            </button>
                            <p className="text-xs text-gray-400 italic">Select files to download or delete</p>
                        </div>
                    )}
                </div>
            </div>

            {loading && <div className="text-center py-20 text-gray-400">Loading...</div>}
            {error && <div className="text-center py-20 text-red-500">{error}</div>}

            {!loading && !error && result?.items.length === 0 && (
                <div className="text-center py-20 bg-gray-100 rounded-lg">
                    <p className="text-gray-500">No files uploaded yet.</p>
                </div>
            )}

            {!loading && !error && result && result.items.length > 0 && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {result.items.map((file, i) => {
                            const imgIdx = imageItems.indexOf(file)
                            const isSelected = selected.has(file.fileName)
                            return (
                                <div
                                    key={i}
                                    onClick={() => handleCardClick(file, imgIdx)}
                                    className={`group relative bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden cursor-pointer
                                        ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                                >
                                    {/* Checkbox (select mode) */}
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
                                    <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                                        {isImage(file.contentType, file.fileName) ? (
                                            <img src={file.blobUri} alt={displayName(file.fileName)}
                                                className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                                        ) : isZip(file.contentType, file.fileName) ? (
                                            <div className="text-gray-400 text-center p-4">
                                                <div className="text-3xl mb-1">📦</div>
                                                <div className="text-xs">ZIP Archive</div>
                                            </div>
                                        ) : (
                                            <div className="text-gray-400 text-center p-4">
                                                <div className="text-3xl mb-1">🎬</div>
                                                <div className="text-xs">Video</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-2">
                                        <p className="text-xs text-gray-700 truncate" title={displayName(file.fileName)}>
                                            {displayName(file.fileName)}
                                        </p>
                                        <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {renderPagination()}

                    <p className="text-center text-xs text-gray-400 mt-4">
                        Page {result.page} of {result.totalPages}
                    </p>
                </>
            )}

            {/* Lightbox */}
            {currentLightboxImage && (
                <div
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
                    onClick={() => setLightboxIndex(null)}
                >
                    {/* Close */}
                    <button
                        onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 text-white text-4xl leading-none hover:text-gray-300 z-10"
                        aria-label="Close"
                    >
                        ×
                    </button>

                    {/* Prev */}
                    {lightboxIndex! > 0 && (
                        <button
                            onClick={e => { e.stopPropagation(); setLightboxIndex(i => i! - 1) }}
                            className="absolute left-4 text-white text-5xl hover:text-gray-300 z-10 select-none px-2"
                            aria-label="Previous"
                        >
                            ‹
                        </button>
                    )}

                    {/* Image */}
                    <img
                        src={currentLightboxImage.blobUri}
                        alt={displayName(currentLightboxImage.fileName)}
                        className="max-w-[90vw] max-h-[85vh] object-contain rounded shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />

                    {/* Next */}
                    {lightboxIndex! < imageItems.length - 1 && (
                        <button
                            onClick={e => { e.stopPropagation(); setLightboxIndex(i => i! + 1) }}
                            className="absolute right-4 text-white text-5xl hover:text-gray-300 z-10 select-none px-2"
                            aria-label="Next"
                        >
                            ›
                        </button>
                    )}

                    {/* Caption */}
                    <div className="absolute bottom-4 text-center w-full text-white text-sm opacity-70 pointer-events-none">
                        {displayName(currentLightboxImage.fileName)} · {formatBytes(currentLightboxImage.size)}
                        <span className="ml-3 text-xs opacity-60">
                            {lightboxIndex! + 1} / {imageItems.length}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
