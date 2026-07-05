import { useEffect, useState } from 'react'
import { shareService } from '../services/api'

interface ShareRecord {
    id: string
    blobName: string
    displayName: string
    isDirectory: boolean
    type: 'Public' | 'Internal'
    ownerName: string
    createdAt: string
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function MyShares() {
    const [shares, setShares] = useState<ShareRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [revoking, setRevoking] = useState<string | null>(null)
    const [copied, setCopied] = useState<string | null>(null)
    const [filter, setFilter] = useState<'All' | 'Public' | 'Internal'>('All')

    const shareUrl = (id: string) => `${window.location.origin}/shared/${id}`

    const load = async () => {
        setLoading(true); setError(null)
        try {
            const res = await shareService.getMyShares()
            setShares(res.data)
        } catch { setError('Failed to load shared items.') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const revoke = async (shareId: string) => {
        if (!confirm('Revoke this share link? Anyone using it will lose access.')) return
        setRevoking(shareId)
        try {
            await shareService.revokeShare(shareId)
            setShares(prev => prev.filter(s => s.id !== shareId))
        } catch { setError('Failed to revoke share.') }
        finally { setRevoking(null) }
    }

    const copyLink = async (id: string) => {
        try {
            await navigator.clipboard.writeText(shareUrl(id))
            setCopied(id)
            setTimeout(() => setCopied(null), 2000)
        } catch { /* ignore */ }
    }

    const filtered = filter === 'All' ? shares : shares.filter(s => s.type === filter)
    const publicCount = shares.filter(s => s.type === 'Public').length
    const internalCount = shares.filter(s => s.type === 'Internal').length

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-7">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent mb-1">
                    Shared Items
                </h1>
                <p className="text-slate-400 text-sm">
                    Manage links to your files and folders
                </p>
            </div>

            {/* Stats */}
            {!loading && shares.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm text-center">
                        <p className="text-2xl font-bold text-slate-800">{shares.length}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Total links</p>
                    </div>
                    <div className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 shadow-sm text-center">
                        <p className="text-2xl font-bold text-teal-700">{internalCount}</p>
                        <p className="text-xs text-teal-500 mt-0.5">Internal</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 shadow-sm text-center">
                        <p className="text-2xl font-bold text-amber-600">{publicCount}</p>
                        <p className="text-xs text-amber-500 mt-0.5">Public</p>
                    </div>
                </div>
            )}

            {/* Filter tabs */}
            {!loading && shares.length > 0 && (
                <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
                    {(['All', 'Internal', 'Public'] as const).map(t => (
                        <button key={t} onClick={() => setFilter(t)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${filter === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            )}

            {error && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">{error}</div>
            )}

            {loading && (
                <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm">Loading…</span>
                </div>
            )}

            {!loading && shares.length === 0 && (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 flex items-center justify-center">
                        <svg className="w-7 h-7 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                    </div>
                    <p className="text-slate-700 font-semibold mb-1">No shared items yet</p>
                    <p className="text-sm text-slate-400">Click the share icon on any file or folder to create a link.</p>
                </div>
            )}

            {!loading && filtered.length === 0 && shares.length > 0 && (
                <p className="text-slate-400 text-sm py-8 text-center">No {filter.toLowerCase()} shares.</p>
            )}

            {/* Share list */}
            {!loading && filtered.length > 0 && (
                <div className="space-y-3">
                    {filtered.map(share => (
                        <div key={share.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-5 py-4">
                                <div className="flex items-start gap-3">
                                    {/* Icon */}
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${share.isDirectory ? 'bg-amber-50' : 'bg-indigo-50'}`}>
                                        {share.isDirectory ? (
                                            <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M10 4H2v16h20V6H12l-2-2z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="font-semibold text-slate-800 text-sm truncate">{share.displayName}</p>
                                            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                                                share.type === 'Public'
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-teal-100 text-teal-700'
                                            }`}>{share.type}</span>
                                        </div>
                                        <p className="text-xs text-slate-400">Created {formatDate(share.createdAt)}</p>

                                        {/* Link row */}
                                        <div className="flex items-center gap-2 mt-2.5">
                                            <input readOnly value={shareUrl(share.id)}
                                                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 font-mono focus:outline-none min-w-0" />
                                            <button onClick={() => copyLink(share.id)}
                                                className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                                    copied === share.id
                                                        ? 'bg-emerald-600 text-white'
                                                        : share.type === 'Public'
                                                            ? 'bg-amber-500 text-white hover:bg-amber-600'
                                                            : 'bg-teal-600 text-white hover:bg-teal-700'
                                                }`}>
                                                {copied === share.id ? 'Copied!' : 'Copy'}
                                            </button>
                                            <a href={shareUrl(share.id)} target="_blank" rel="noopener noreferrer"
                                                className="shrink-0 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                                title="Open link">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                                </svg>
                                            </a>
                                            <button onClick={() => revoke(share.id)} disabled={revoking === share.id}
                                                className="shrink-0 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                                                title="Revoke">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
