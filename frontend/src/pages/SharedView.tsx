import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { shareService } from '../services/api'
import SecureImage from '../components/SecureImage'
import { useAuth } from '../contexts/AuthContext'

interface FileItem {
    fileName: string
    blobUri: string
    contentType: string
    size: number
    uploadedAt: string
    isDirectory: boolean
}

interface ShareInfo {
    id: string
    displayName: string
    isDirectory: boolean
    type: string
    ownerName: string
    createdAt: string
}

type PageState = 'loading' | 'auth-required' | 'forbidden' | 'not-found' | 'error' | 'loaded'

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function isImage(contentType: string, fileName: string) {
    return contentType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName)
}
function isVideo(contentType: string, fileName: string) {
    return contentType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName)
}

function lastName(path: string) {
    return path.split('/').filter(Boolean).pop() ?? path
}

function displayName(fileName: string) {
    const afterSlash = fileName.includes('/') ? fileName.split('/').slice(1).join('/') : fileName
    return afterSlash.replace(/(^|\/)[0-9a-f-]{36}_/i, '$1')
}

// Turn a share's /download/ blobUri into a /stream/ URL for inline <video> playback.
// Public shares authorize via the ?shareId= already in the URL; internal shares also need the
// access_token in the query (media elements can't send Authorization headers).
function streamUrlFromBlobUri(blobUri: string, token: string | null, isPublic: boolean) {
    let url = blobUri.replace('/api/files/download/', '/api/files/stream/')
    if (!isPublic && token) {
        const sep = url.includes('?') ? '&' : '?'
        url = `${url}${sep}access_token=${encodeURIComponent(token)}`
    }
    return url
}

async function triggerDownload(url: string, name: string, token: string | null, isPublic: boolean) {
    // Public shares are self-authorizing via the ?shareId= in the URL, so we can stream the
    // download straight to disk (no auth header, no buffering the whole file into memory —
    // important for large videos). ?download=1 forces an attachment response.
    if (isPublic) {
        const sep = url.includes('?') ? '&' : '?'
        const a = document.createElement('a')
        a.href = `${url}${sep}download=1`
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
    }
    // Internal shares require the auth header, so fetch with the token then save the blob.
    try {
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch(url, { headers, credentials: 'omit' })
        if (!res.ok) throw new Error()
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(a.href)
    } catch { /* silently fail */ }
}

export default function SharedView() {
    const { shareId } = useParams<{ shareId: string }>()
    const { token } = useAuth()
    const [state, setState] = useState<PageState>('loading')
    const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null)
    const [items, setItems] = useState<FileItem[]>([])
    const [errorMsg, setErrorMsg] = useState('')
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

    useEffect(() => {
        if (!shareId) { setState('not-found'); return }
        shareService.accessShare(shareId)
            .then(res => {
                setShareInfo(res.data.share)
                setItems(res.data.items)
                setState('loaded')
            })
            .catch(err => {
                if (err.response?.status === 401 && err.response?.data?.requiresAuth) {
                    setState('auth-required')
                } else if (err.response?.status === 403) {
                    setState('forbidden')
                } else if (err.response?.status === 404) {
                    setErrorMsg(err.response?.data?.message ?? 'Share not found.')
                    setState('not-found')
                } else {
                    setErrorMsg('Failed to load shared content.')
                    setState('error')
                }
            })
    }, [shareId])

    const imageItems = items.filter(f => !f.isDirectory && isImage(f.contentType, f.fileName))
    const currentLightbox = lightboxIdx !== null ? imageItems[lightboxIdx] : null

    const MinimalHeader = () => (
        <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/70 px-4 py-3 flex items-center gap-2.5">
            <Link to="/" className="flex items-center gap-2 group">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                </div>
                <span className="font-bold text-slate-900 text-sm">ExStore</span>
            </Link>
        </header>
    )

    if (state === 'loading') {
        return (
            <div className="min-h-screen bg-slate-50">
                <MinimalHeader />
                <div className="flex items-center justify-center py-32 gap-3 text-slate-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Loading…</span>
                </div>
            </div>
        )
    }

    if (state === 'auth-required') {
        return (
            <div className="min-h-screen bg-slate-50">
                <MinimalHeader />
                <div className="flex items-center justify-center py-20 px-4">
                    <div className="max-w-sm w-full text-center">
                        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Sign in required</h2>
                        <p className="text-slate-500 text-sm mb-6">This link is for ExStore users only. Sign in to view the shared content.</p>
                        <Link to={`/login?redirect=/shared/${shareId}`}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-violet-700 transition shadow-md shadow-indigo-100">
                            Sign in to view
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    if (state === 'forbidden') {
        return (
            <div className="min-h-screen bg-slate-50">
                <MinimalHeader />
                <div className="flex items-center justify-center py-20 px-4">
                    <div className="max-w-sm w-full text-center">
                        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-50 flex items-center justify-center">
                            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Access denied</h2>
                        <p className="text-slate-500 text-sm mb-6">You don't have permission to view this shared content. The owner may have restricted access to specific users.</p>
                        <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition">
                            Go home
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    if (state === 'not-found' || state === 'error') {
        return (
            <div className="min-h-screen bg-slate-50">
                <MinimalHeader />
                <div className="flex items-center justify-center py-20 px-4">
                    <div className="max-w-sm w-full text-center">
                        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-50 flex items-center justify-center">
                            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Link not found</h2>
                        <p className="text-slate-500 text-sm mb-6">{errorMsg || 'This share link is invalid or has been revoked.'}</p>
                        <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition">
                            Go home
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    // Loaded
    const singleFile = !shareInfo?.isDirectory && items.length === 1 ? items[0] : null

    return (
        <div className="min-h-screen bg-slate-50">
            <MinimalHeader />

            <div className="max-w-5xl mx-auto px-4 py-8">
                {/* Share info banner */}
                <div className="mb-6 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${shareInfo?.isDirectory ? 'bg-amber-50' : 'bg-indigo-50'}`}>
                            {shareInfo?.isDirectory ? (
                                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M10 4H2v16h20V6H12l-2-2z" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                            )}
                        </div>
                        <div>
                            <p className="font-semibold text-slate-800">{shareInfo?.displayName}</p>
                            <p className="text-xs text-slate-400">Shared by {shareInfo?.ownerName}</p>
                        </div>
                    </div>
                    <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                        shareInfo?.type === 'Public'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-teal-100 text-teal-700'
                    }`}>
                        {shareInfo?.type === 'Public' ? '🌐 Public' : '🔒 Internal'}
                    </span>
                </div>

                {/* Single file view */}
                {singleFile && (
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        {isImage(singleFile.contentType, singleFile.fileName) && (
                            <div className="flex items-center justify-center bg-slate-900 max-h-[70vh] overflow-hidden">
                                <SecureImage src={singleFile.blobUri}
                                    alt={displayName(singleFile.fileName)}
                                    className="max-h-[70vh] max-w-full object-contain" />
                            </div>
                        )}
                        {isVideo(singleFile.contentType, singleFile.fileName) && (
                            <div className="flex items-center justify-center bg-slate-900">
                                <video
                                    src={streamUrlFromBlobUri(singleFile.blobUri, token, shareInfo?.type === 'Public')}
                                    controls
                                    className="max-h-[70vh] max-w-full bg-black"
                                />
                            </div>
                        )}
                        <div className="px-5 py-4 flex items-center justify-between gap-4">
                            <div>
                                <p className="font-semibold text-slate-800 text-sm">
                                    {lastName(displayName(singleFile.fileName))}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">{formatBytes(singleFile.size)}</p>
                            </div>
                            <button onClick={() => triggerDownload(singleFile.blobUri, lastName(displayName(singleFile.fileName)), token, shareInfo?.type === 'Public')}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-600 hover:to-violet-700 transition shadow-sm">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Download
                            </button>
                        </div>
                    </div>
                )}

                {/* Directory / multi-file grid */}
                {shareInfo?.isDirectory && items.length > 0 && (
                    <>
                        <p className="text-sm text-slate-400 mb-4">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {items.map((file, i) => {
                                const imgIdx = imageItems.indexOf(file)
                                const name = file.isDirectory
                                    ? lastName(file.fileName)
                                    : lastName(displayName(file.fileName))

                                return (
                                    <div key={i}
                                        onClick={() => imgIdx >= 0 ? setLightboxIdx(imgIdx) : triggerDownload(file.blobUri, name, token, shareInfo?.type === 'Public')}                                        className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all">
                                        <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                                            {file.isDirectory ? (
                                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
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
                                            <p className="text-xs text-slate-700 truncate font-medium" title={name}>{name}</p>
                                            {!file.isDirectory && <p className="text-xs text-slate-400 mt-0.5">{formatBytes(file.size)}</p>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}

                {shareInfo?.isDirectory && items.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                        <p className="text-slate-500 font-medium">This folder is empty</p>
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {currentLightbox && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
                    onClick={() => setLightboxIdx(null)}>
                    <button onClick={() => setLightboxIdx(null)}
                        className="absolute top-4 right-4 text-white text-4xl leading-none hover:text-gray-300 z-10">×</button>
                    {lightboxIdx! > 0 && (
                        <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i! - 1) }}
                            className="absolute left-4 text-white text-5xl hover:text-gray-300 z-10 select-none px-2">‹</button>
                    )}
                    <div onClick={e => e.stopPropagation()}>
                        <SecureImage src={currentLightbox.blobUri}
                            alt={displayName(currentLightbox.fileName)}
                            className="max-w-[90vw] max-h-[85vh] object-contain rounded shadow-2xl" />
                    </div>
                    {lightboxIdx! < imageItems.length - 1 && (
                        <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i! + 1) }}
                            className="absolute right-4 text-white text-5xl hover:text-gray-300 z-10 select-none px-2">›</button>
                    )}
                    <button
                        onClick={e => { e.stopPropagation(); triggerDownload(currentLightbox.blobUri, lastName(displayName(currentLightbox.fileName)), token, shareInfo?.type === 'Public') }}
                        className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition z-10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download
                    </button>
                    <div className="absolute bottom-4 left-4 text-white text-sm opacity-70 pointer-events-none">
                        {lightboxIdx! + 1} / {imageItems.length}
                    </div>
                </div>
            )}
        </div>
    )
}
