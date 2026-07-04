import { useEffect, useState } from 'react'
import { adminService } from '../services/api'

interface UserRecord {
    id: string
    email: string
    name: string
    role: string
    isApproved: boolean
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

    return (
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Identity */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${user.isApproved ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                        {user.name}
                        {user.role === 'Admin' && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Admin</span>
                        )}
                        {user.isUploadLocked && (
                            <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">🔒 Uploads locked</span>
                        )}
                    </p>
                    <p className="text-sm text-gray-500 truncate">{user.email}</p>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Quota input */}
                <div className="flex items-center gap-1">
                    <label className="text-xs text-gray-500">Quota</label>
                    <input
                        type="number" min={1} max={100}
                        value={quotaInput}
                        onChange={e => setQuotaInput(Number(e.target.value))}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <span className="text-xs text-gray-400">GB</span>
                </div>

                {/* Lock toggle — not for admins */}
                {user.role !== 'Admin' && (
                    <button
                        onClick={() => setLocked(l => !l)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition ${
                            locked
                                ? 'bg-red-50 border-red-300 text-red-600'
                                : 'bg-gray-50 border-gray-300 text-gray-600'
                        }`}
                    >
                        {locked ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                )}

                {/* Save settings */}
                <button
                    onClick={saveSettings} disabled={saving}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                    {saving ? '…' : 'Save'}
                </button>

                {/* Approve / Revoke — not for admins */}
                {user.role !== 'Admin' && !user.isApproved && (
                    <button onClick={approve} disabled={!!actionLoading}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
                        {actionLoading === 'approve' ? '…' : 'Approve'}
                    </button>
                )}
                {user.role !== 'Admin' && user.isApproved && (
                    <button onClick={revoke} disabled={!!actionLoading}
                        className="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition">
                        {actionLoading === 'revoke' ? '…' : 'Revoke'}
                    </button>
                )}

                {msg && (
                    <span className={`text-xs ${msg === 'Saved' ? 'text-green-600' : 'text-red-500'}`}>{msg}</span>
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
            <h1 className="text-4xl font-bold mb-2">Admin Panel</h1>
            <p className="text-gray-500 mb-8">{users.length} total users · {pending.length} pending approval</p>

            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            {loading && <div className="text-gray-400 text-center py-10">Loading…</div>}

            {/* Pending approvals */}
            {!loading && pending.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <span className="bg-yellow-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
                        Pending Approval
                    </h2>
                    <div className="divide-y divide-yellow-100 border border-yellow-200 rounded-xl overflow-hidden bg-yellow-50">
                        {pending.map(u => <UserRow key={u.id} user={u} onRefresh={load} />)}
                    </div>
                </section>
            )}

            {/* All users */}
            {!loading && (
                <section>
                    <h2 className="text-lg font-semibold mb-3">All Users ({users.length})</h2>
                    <p className="text-xs text-gray-400 mb-3">Set storage quota (1–100 GB) and toggle upload lock per user, then click Save.</p>
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                        {users.map(u => <UserRow key={u.id} user={u} onRefresh={load} />)}
                    </div>
                </section>
            )}
        </div>
    )
}

