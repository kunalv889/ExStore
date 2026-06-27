import { useEffect, useState } from 'react'
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

function isImage(contentType: string, fileName: string) {
    return contentType.startsWith('image/') ||
        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName)
}

export default function Photos() {
    const [result, setResult] = useState<PagedResult | null>(null)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await fileService.getFiles(page, pageSize)
                setResult(response.data)
            } catch {
                setError('Failed to load photos. Please try again.')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [page, pageSize])

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize)
        setPage(1)
    }

    const renderPagination = () => {
        if (!result || result.totalPages <= 1) return null
        const pages: number[] = []
        const start = Math.max(1, page - 2)
        const end = Math.min(result.totalPages, page + 2)
        for (let i = start; i <= end; i++) pages.push(i)

        return (
            <div className="flex items-center justify-center gap-1 mt-8">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100"
                >
                    ‹ Prev
                </button>
                {start > 1 && <span className="px-2 text-gray-400">…</span>}
                {pages.map(p => (
                    <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-9 h-9 rounded border text-sm ${p === page
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 hover:bg-gray-100'
                        }`}
                    >
                        {p}
                    </button>
                ))}
                {end < result.totalPages && <span className="px-2 text-gray-400">…</span>}
                <button
                    onClick={() => setPage(p => Math.min(result.totalPages, p + 1))}
                    disabled={page === result.totalPages}
                    className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100"
                >
                    Next ›
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-4xl font-bold">All Photos</h1>
                    {result && (
                        <p className="text-gray-500 mt-1">
                            {result.totalCount} file{result.totalCount !== 1 ? 's' : ''} total
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Show</span>
                    <select
                        value={pageSize}
                        onChange={e => handlePageSizeChange(Number(e.target.value))}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                        {PAGE_SIZE_OPTIONS.map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                    <span>per page</span>
                </div>
            </div>

            {loading && (
                <div className="text-center py-20 text-gray-400">Loading...</div>
            )}

            {error && (
                <div className="text-center py-20 text-red-500">{error}</div>
            )}

            {!loading && !error && result?.items.length === 0 && (
                <div className="text-center py-20 bg-gray-100 rounded-lg">
                    <p className="text-gray-500">No photos uploaded yet.</p>
                </div>
            )}

            {!loading && !error && result && result.items.length > 0 && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {result.items.map((file, i) => (
                            <a
                                key={i}
                                href={file.blobUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group block bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden"
                            >
                                <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                                    {isImage(file.contentType, file.fileName) ? (
                                        <img
                                            src={file.blobUri}
                                            alt={file.fileName}
                                            className="w-full h-full object-cover group-hover:scale-105 transition"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="text-gray-400 text-center p-4">
                                            <div className="text-3xl mb-1">🎬</div>
                                            <div className="text-xs">Video</div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-2">
                                    <p className="text-xs text-gray-700 truncate" title={file.fileName}>
                                        {file.fileName.replace(/^[0-9a-f-]{36}_/i, '')}
                                    </p>
                                    <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                                </div>
                            </a>
                        ))}
                    </div>

                    {renderPagination()}

                    <p className="text-center text-xs text-gray-400 mt-4">
                        Page {result.page} of {result.totalPages}
                    </p>
                </>
            )}
        </div>
    )
}
