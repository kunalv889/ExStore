import { useEffect, useState } from 'react'
import { adminService } from '../services/api'

interface UserRecord {
    id: string
    email: string
    name: string
    role: string
    isApproved: boolean
    isEmailVerified: boolean
    createdAt: string
    storageQuotaGB: number
    isUploadLocked: boolean
}

function UserRow({ user, onRefresh }: { user: UserRecord; onRefresh: () => void }) {
    const [quotaInput, setQuotaInput] = useState(user.storageQuotaGB)
    const [locked, setLocked] = useState(user.isUploadLocked)
    const [saving, setSaving] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [msg, setMsg] = useState<string | null>(null)

    const saveSettings = async () => {
        if (quotaInput < 1 || quotaInput > 100) { setMsg('Quota must be 1–100 GB'); return }
        setSaving(true); setMsg(null)
        try {
            await adminService.updateUserSettings(user.id, quotaInput, locked)
            setMsg('Saved')
            setTimeout(() => setMsg(null), 2000)
        } catch { setMsg('Save failed') }
        finally { setSaving(false) }
    }

    const approve = async () => {
        setActionLoading('approve')
        try { await adminService.approveUser(user.id); onRefresh() }
        catch { setMsg('Failed') } finally { setActionLoading(null) }
    }

    const revoke = async () => {
        if (!confirm(`Revoke ${user.name}'s access?`)) return
        setActionLoading('revoke')
        try { await adminService.revokeUser(user.id); onRefresh() }
        catch { setMsg('Failed') } finally { setActionLoading(null) }
    }

    const resetVerification = async () => {
        if (!confirm(`Reset email verification for ${user.name}? They will receive a new verification email.`)) return
        setActionLoading('resetVerify')
        try { await adminService.resetEmailVerification(user.id); onRefresh() }
        catch { setMsg('Failed') } finally { setActionLoading(null) }
    }

    const deleteUser = async () => {
        if (!confirm(`Permanently delete ${user.name}'s account and all their files? This cannot be undone.`)) return
        setActionLoading('delete')
        try { await adminService.deleteUser(user.id); onRefresh() }
        catch { setMsg('Failed') } finally { setActionLoading(null) }
    }

    return (
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Identity */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-white text-sm font-bold">{user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                        {user.name}
                        {user.role === 'Admin' && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
                        )}
                        {user.isUploadLocked && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Locked</span>
                        )}
                        {!user.isApproved && user.role !== 'Admin' && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pending</span>
                        )}
                        {!user.isEmailVerified && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">Unverified</span>
                        )}
                    </p>
                    <p className="text-sm text-slate-400 truncate">{user.email}</p>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Quota input */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                    <span className="text-xs text-slate-400 font-medium">Quota</span>
                    <input
                        type="number" min={1} max={100}
                        value={quotaInput}
                        onChange={e => setQuotaInput(Number(e.target.value))}
                        className="w-14 bg-transparent text-sm text-center text-slate-700 font-semibold focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">GB</span>
                </div>

                {/* Lock toggle — not for admins */}
                {user.role !== 'Admin' && (
                    <button
                        onClick={() => setLocked(l => !l)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition ${
                            locked
                                ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        {locked ? (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>Locked</>
                        ) : (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>Unlocked</>
                        )}
                    </button>
                )}

                {/* Save settings */}
                <button
                    onClick={saveSettings} disabled={saving}
                    className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
                >
                    {saving ? '…' : 'Save'}
                </button>

                {/* Approve / Revoke — not for admins */}
                {user.role !== 'Admin' && !user.isApproved && (
                    <button onClick={approve} disabled={!!actionLoading}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm">
                        {actionLoading === 'approve' ? '…' : 'Approve'}
                    </button>
                )}
                {user.role !== 'Admin' && user.isApproved && (
                    <button onClick={revoke} disabled={!!actionLoading}
                        className="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 transition shadow-sm">
                        {actionLoading === 'revoke' ? '…' : 'Revoke'}
                    </button>
                )}

                {/* Reset email verification — only for non-admins that are already verified */}
                {user.role !== 'Admin' && user.isEmailVerified && (
                    <button onClick={resetVerification} disabled={!!actionLoading}
                        className="px-3 py-1.5 text-xs font-semibold bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 transition shadow-sm">
                        {actionLoading === 'resetVerify' ? '…' : 'Reset Email'}
                    </button>
                )}

                {/* Delete user — not for admins */}
                {user.role !== 'Admin' && (
                    <button onClick={deleteUser} disabled={!!actionLoading}
                        className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition shadow-sm">
                        {actionLoading === 'delete' ? '…' : 'Delete'}
                    </button>
                )}

                {msg && (
                    <span className={`text-xs font-medium ${msg === 'Saved' ? 'text-emerald-600' : 'text-red-500'}`}>{msg}</span>
                )}
            </div>
        </div>
    )
}

export default function Admin() {
    const [users, setUsers] = useState<UserRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = async () => {
        setLoading(true); setError(null)
        try {
            const res = await adminService.getUsers()
            setUsers(res.data)
        } catch { setError('Failed to load users.') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const pending = users.filter(u => !u.isApproved && u.role === 'User')

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent mb-1">Admin Panel</h1>
                <p className="text-slate-400 text-sm">{users.length} total user{users.length !== 1 ? 's' : ''} &middot; {pending.length} pending approval</p>
            </div>

            {error && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                    {error}
                </div>
            )}
            {loading && (
                <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm">Loading&hellip;</span>
                </div>
            )}

            {/* Pending approvals */}
            {!loading && pending.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <span className="bg-amber-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
                        Pending Approval
                    </h2>
                    <div className="divide-y divide-amber-100 border border-amber-200 rounded-2xl overflow-hidden bg-amber-50/60 shadow-sm">
                        {pending.map(u => <UserRow key={u.id} user={u} onRefresh={load} />)}
                    </div>
                </section>
            )}

            {/* All users */}
            {!loading && (
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold text-slate-700">All Users <span className="text-slate-400 font-normal">({users.length})</span></h2>
                        <p className="text-xs text-slate-400">Set quota (1–100 GB) and upload lock per user, then Save.</p>
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                        {users.map(u => <UserRow key={u.id} user={u} onRefresh={load} />)}
                    </div>
                </section>
            )}
        </div>
    )
}

