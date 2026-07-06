import { useEffect, useRef, useState } from 'react'
import { shareService } from '../services/api'

interface ShareRecord {
    id: string
    blobName: string
    displayName: string
    isDirectory: boolean
    type: 'Public' | 'Internal'
    ownerName: string
    createdAt: string
    allowedUserIds: string[]
}

interface UserOption {
    id: string
    name: string
    email: string
}

interface Props {
    blobName: string
    displayName: string
    isDirectory: boolean
    onClose: () => void
}

export default function ShareModal({ blobName, displayName, isDirectory, onClose }: Props) {
    const [shares, setShares] = useState<ShareRecord[]>([])
    const [shareableUsers, setShareableUsers] = useState<UserOption[]>([])
    const [loadingShares, setLoadingShares] = useState(true)
    const [loadingUsers, setLoadingUsers] = useState(true)
    const [creating, setCreating] = useState<'Public' | 'Internal' | null>(null)
    const [revoking, setRevoking] = useState<string | null>(null)
    const [confirmPublic, setConfirmPublic] = useState(false)
    const [copied, setCopied] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [internalScope, setInternalScope] = useState<'all' | 'specific'>('all')
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
    const [userSearch, setUserSearch] = useState('')
    const [editingInternal, setEditingInternal] = useState(false)

    const searchRef = useRef<HTMLInputElement>(null)
    const shareUrl = (id: string) => `${window.location.origin}/shared/${id}`

    useEffect(() => {
        setLoadingShares(true)
        setLoadingUsers(true)
        shareService.getMyShares(blobName)
            .then(res => {
                const s: ShareRecord[] = res.data
                setShares(s)
                const existing = s.find(x => x.type === 'Internal')
                if (existing) {
                    if (existing.allowedUserIds.length > 0) {
                        setInternalScope('specific')
                        setSelectedUserIds(new Set(existing.allowedUserIds))
                    } else {
                        setInternalScope('all')
                    }
                }
            })
            .catch(() => setError('Failed to load shares.'))
            .finally(() => setLoadingShares(false))

        shareService.getShareableUsers()
            .then(res => setShareableUsers(res.data))
            .catch(() => { /* non-fatal */ })
            .finally(() => setLoadingUsers(false))
    }, [blobName])

    useEffect(() => {
        if (internalScope === 'specific') setTimeout(() => searchRef.current?.focus(), 50)
    }, [internalScope])

    const reload = async () => {
        try {
            const res = await shareService.getMyShares(blobName)
            setShares(res.data)
        } catch { /* ignore */ }
    }

    const createInternal = async () => {
        const ids = internalScope === 'specific' ? Array.from(selectedUserIds) : []
        setCreating('Internal'); setError(null)
        try {
            await shareService.createShare(blobName, displayName, isDirectory, 'Internal', ids)
            await reload()
            setEditingInternal(false)
        } catch { setError('Failed to create share link.') }
        finally { setCreating(null) }
    }

    const createPublic = async () => {
        setCreating('Public'); setError(null)
        try {
            await shareService.createShare(blobName, displayName, isDirectory, 'Public', [])
            await reload()
        } catch { setError('Failed to create share link.') }
        finally { setCreating(null); setConfirmPublic(false) }
    }

    const revoke = async (shareId: string) => {
        setRevoking(shareId); setError(null)
        try {
            await shareService.revokeShare(shareId)
            setShares(prev => prev.filter(s => s.id !== shareId))
            setEditingInternal(false)
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

    const toggleUser = (id: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const filteredUsers = shareableUsers.filter(u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
    )

    const getUserName = (id: string) => shareableUsers.find(u => u.id === id)?.name ?? id

    const internalShare = shares.find(s => s.type === 'Internal')
    const publicShare = shares.find(s => s.type === 'Public')
    const loading = loadingShares || loadingUsers

    const internalBtnLabel = () => {
        if (creating === 'Internal') return 'Saving…'
        if (internalShare) return 'Update access'
        if (internalScope === 'specific' && selectedUserIds.size === 0) return 'Select at least 1 user'
        const count = internalScope === 'specific' ? selectedUserIds.size : null
        return count ? `Create link for ${count} user${count !== 1 ? 's' : ''}` : 'Create internal link'
    }

    const showInternalPicker = !internalShare || editingInternal

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-5 pt-5 pb-4 bg-gradient-to-r from-indigo-500 to-violet-600 flex items-start justify-between gap-3 shrink-0">
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
                        &times;
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto p-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">{error}</div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-sm">Loading&hellip;</span>
                        </div>
                    ) : (
                        <>
                            {/* Internal Share */}
                            <div className={`rounded-xl border p-4 transition-colors ${internalShare ? 'border-teal-200 bg-teal-50/50' : 'border-slate-200 bg-slate-50/40'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <svg className="w-4 h-4 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-slate-700">Internal</span>
                                    {internalShare && !editingInternal && (
                                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                                    )}
                                </div>

                                {internalShare && !editingInternal ? (
                                    <div className="space-y-2.5">
                                        <p className="text-xs text-slate-500">
                                            {internalShare.allowedUserIds.length === 0
                                                ? 'Accessible by all ExStore users'
                                                : `Restricted to: ${internalShare.allowedUserIds.map(getUserName).join(', ')}`}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <input readOnly value={shareUrl(internalShare.id)}
                                                className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 font-mono focus:outline-none" />
                                            <button onClick={() => copyLink(internalShare.id)}
                                                className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition">
                                                {copied === internalShare.id ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => setEditingInternal(true)}
                                                className="text-xs text-teal-700 hover:text-teal-900 hover:underline transition">
                                                Edit access
                                            </button>
                                            <button onClick={() => revoke(internalShare.id)} disabled={revoking === internalShare.id}
                                                className="text-xs text-red-500 hover:text-red-700 hover:underline transition disabled:opacity-50">
                                                {revoking === internalShare.id ? 'Revoking&hellip;' : 'Revoke link'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 mt-2">
                                        <p className="text-xs text-slate-500">Choose who can access this link:</p>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" name={`scope-${blobName}`} value="all"
                                                    checked={internalScope === 'all'}
                                                    onChange={() => setInternalScope('all')}
                                                    className="accent-teal-600 w-3.5 h-3.5" />
                                                <span className="text-sm text-slate-700">All ExStore users</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" name={`scope-${blobName}`} value="specific"
                                                    checked={internalScope === 'specific'}
                                                    onChange={() => setInternalScope('specific')}
                                                    className="accent-teal-600 w-3.5 h-3.5" />
                                                <span className="text-sm text-slate-700">
                                                    Specific users
                                                    {internalScope === 'specific' && selectedUserIds.size > 0 && (
                                                        <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                                                            {selectedUserIds.size} selected
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        </div>

                                        {internalScope === 'specific' && (
                                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                                                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                                    </svg>
                                                    <input ref={searchRef} type="text" placeholder="Search users&hellip;"
                                                        value={userSearch}
                                                        onChange={e => setUserSearch(e.target.value)}
                                                        className="flex-1 text-xs bg-transparent focus:outline-none text-slate-700 placeholder:text-slate-400" />
                                                    {userSearch && (
                                                        <button onClick={() => setUserSearch('')}
                                                            className="text-slate-300 hover:text-slate-500 text-sm leading-none">&times;</button>
                                                    )}
                                                </div>

                                                {filteredUsers.length > 0 && (
                                                    <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                                                        <span className="text-xs text-slate-400">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
                                                        <button
                                                            onClick={() => {
                                                                const allIds = filteredUsers.map(u => u.id)
                                                                const allSelected = allIds.every(id => selectedUserIds.has(id))
                                                                if (allSelected) {
                                                                    setSelectedUserIds(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n })
                                                                } else {
                                                                    setSelectedUserIds(prev => new Set([...prev, ...allIds]))
                                                                }
                                                            }}
                                                            className="text-xs text-teal-600 hover:text-teal-800 font-medium transition">
                                                            {filteredUsers.every(u => selectedUserIds.has(u.id)) ? 'Deselect all' : 'Select all'}
                                                        </button>
                                                    </div>
                                                )}

                                                <ul className="max-h-44 overflow-y-auto divide-y divide-slate-50">
                                                    {filteredUsers.length === 0 ? (
                                                        <li className="px-3 py-4 text-center text-xs text-slate-400">
                                                            {shareableUsers.length === 0 ? 'No other users in the app yet.' : 'No users match your search.'}
                                                        </li>
                                                    ) : filteredUsers.map(u => (
                                                        <li key={u.id}>
                                                            <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-teal-50/60 transition">
                                                                <input type="checkbox"
                                                                    checked={selectedUserIds.has(u.id)}
                                                                    onChange={() => toggleUser(u.id)}
                                                                    className="accent-teal-600 w-3.5 h-3.5 shrink-0" />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-xs font-semibold text-slate-700 truncate">{u.name}</p>
                                                                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                                                                </div>
                                                                {selectedUserIds.has(u.id) && (
                                                                    <svg className="w-3.5 h-3.5 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </label>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            {editingInternal && (
                                                <button onClick={() => setEditingInternal(false)}
                                                    className="px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition">
                                                    Cancel
                                                </button>
                                            )}
                                            <button
                                                onClick={createInternal}
                                                disabled={creating !== null || (internalScope === 'specific' && selectedUserIds.size === 0)}
                                                className="flex-1 px-4 py-2 text-xs font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                                                {internalBtnLabel()}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Public Share */}
                            <div className={`rounded-xl border p-4 transition-colors ${publicShare ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50/40'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-slate-700">Public</span>
                                    {publicShare && (
                                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                                    )}
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
                                            {revoking === publicShare.id ? 'Revoking&hellip;' : 'Revoke link'}
                                        </button>
                                    </div>
                                ) : confirmPublic ? (
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                            </svg>
                                            <p className="text-xs text-amber-800">
                                                <strong>Are you sure?</strong> Anyone on the internet can use this link to view{isDirectory ? ' all files in this folder' : ' this file'}, even without an account.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setConfirmPublic(false)}
                                                className="px-4 py-2 text-xs font-semibold bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition">
                                                Cancel
                                            </button>
                                            <button onClick={createPublic} disabled={creating !== null}
                                                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition">
                                                {creating === 'Public' ? 'Creating&hellip;' : 'Yes, make public'}
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
