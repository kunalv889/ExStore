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

interface Props {
    blobName: string       // full internal path e.g. userId/path/file.jpg
    displayName: string    // human-readable label shown in the modal
    isDirectory: boolean
    onClose: () => void
}

export default function ShareModal({ blobName, displayName, isDirectory, onClose }: Props) {
    const [shares, setShares] = useState<ShareRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState<'Public' | 'Internal' | null>(null)
    const [revoking, setRevoking] = useState<string | null>(null)
    const [confirmPublic, setConfirmPublic] = useState(false)
    const [copied, setCopied] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const shareUrl = (id: string) => `${window.location.origin}/shared/${id}`

    const load = async () => {
        setLoading(true); setError(null)
        try {
            const res = await shareService.getMyShares(blobName)
            setShares(res.data)
        } catch { setError('Failed to load shares.') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [blobName])

    const create = async (type: 'Public' | 'Internal') => {
        setCreating(type); setError(null)
        try {
            await shareService.createShare(blobName, displayName, isDirectory, type)
            await load()
        } catch { setError('Failed to create share link.') }
        finally { setCreating(null); setConfirmPublic(false) }
    }

    const revoke = async (shareId: string) => {
        setRevoking(shareId); setError(null)
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
        } catch {
            // Fallback: select a temporary input
        }
    }

    const internalShare = shares.find(s => s.type === 'Internal')
    const publicShare = shares.find(s => s.type === 'Public')

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-5 pt-5 pb-4 bg-gradient-to-r from-indigo-500 to-violet-600 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                            {isDirectory ? (
                                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M10 4H2v16h20V6H12l-2-2z" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-semibold text-sm truncate">{displayName}</p>
                            <p className="text-indigo-200 text-xs mt-0.5">Share settings</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg w-7 h-7 flex items-center justify-center shrink-0 transition text-lg leading-none">
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">{error}</div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-sm">Loading…</span>
                        </div>
                    ) : (
                        <>
                            {/* Internal Share */}
                            <div className={`rounded-xl border p-4 transition-colors ${internalShare ? 'border-teal-200 bg-teal-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                        </svg>
                                        <span className="text-sm font-semibold text-slate-700">Internal</span>
                                        {internalShare && (
                                            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mb-3">Only signed-in ExStore users can view this link.</p>

                                {internalShare ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input readOnly value={shareUrl(internalShare.id)}
                                                className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 font-mono focus:outline-none" />
                                            <button onClick={() => copyLink(internalShare.id)}
                                                className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition">
                                                {copied === internalShare.id ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <button onClick={() => revoke(internalShare.id)} disabled={revoking === internalShare.id}
                                            className="text-xs text-red-500 hover:text-red-700 hover:underline transition disabled:opacity-50">
                                            {revoking === internalShare.id ? 'Revoking…' : 'Revoke link'}
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => create('Internal')} disabled={creating !== null}
                                        className="px-4 py-2 text-xs font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition">
                                        {creating === 'Internal' ? 'Creating…' : 'Create internal link'}
                                    </button>
                                )}
                            </div>

                            {/* Public Share */}
                            <div className={`rounded-xl border p-4 transition-colors ${publicShare ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                        </svg>
                                        <span className="text-sm font-semibold text-slate-700">Public</span>
                                        {publicShare && (
                                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mb-3">Anyone on the internet with the link can view this.</p>

                                {publicShare ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input readOnly value={shareUrl(publicShare.id)}
                                                className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 font-mono focus:outline-none" />
                                            <button onClick={() => copyLink(publicShare.id)}
                                                className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition">
                                                {copied === publicShare.id ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <button onClick={() => revoke(publicShare.id)} disabled={revoking === publicShare.id}
                                            className="text-xs text-red-500 hover:text-red-700 hover:underline transition disabled:opacity-50">
                                            {revoking === publicShare.id ? 'Revoking…' : 'Revoke link'}
                                        </button>
                                    </div>
                                ) : confirmPublic ? (
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                            </svg>
                                            <p className="text-xs text-amber-800">
                                                <strong>Are you sure?</strong> This creates a public link that anyone on the internet can use to view{isDirectory ? ' all files in this folder' : ' this file'}, even without an ExStore account.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setConfirmPublic(false)}
                                                className="px-4 py-2 text-xs font-semibold bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition">
                                                Cancel
                                            </button>
                                            <button onClick={() => create('Public')} disabled={creating !== null}
                                                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition">
                                                {creating === 'Public' ? 'Creating…' : 'Yes, make public'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => setConfirmPublic(true)} disabled={creating !== null}
                                        className="px-4 py-2 text-xs font-semibold bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition">
                                        Create public link
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
