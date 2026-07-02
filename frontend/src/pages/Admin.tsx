import { useEffect, useState } from 'react'
import { adminService } from '../services/api'

interface UserRecord {
    id: string
    email: string
    name: string
    role: string
    isApproved: boolean
    createdAt: string
}

export default function Admin() {
    const [users, setUsers] = useState<UserRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    const load = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await adminService.getUsers()
            setUsers(res.data)
        } catch {
            setError('Failed to load users.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const approve = async (id: string) => {
        setActionLoading(id + '_approve')
        try {
            await adminService.approveUser(id)
            await load()
        } catch { setError('Failed to approve user.') }
        finally { setActionLoading(null) }
    }

    const revoke = async (id: string) => {
        if (!confirm('Revoke this user\'s access?')) return
        setActionLoading(id + '_revoke')
        try {
            await adminService.revokeUser(id)
            await load()
        } catch { setError('Failed to revoke user.') }
        finally { setActionLoading(null) }
    }

    const pending = users.filter(u => !u.isApproved && u.role === 'User')
    const approved = users.filter(u => u.isApproved)

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
                    <div className="divide-y divide-gray-100 border border-yellow-200 rounded-xl overflow-hidden bg-yellow-50">
                        {pending.map(u => (
                            <div key={u.id} className="flex items-center justify-between px-5 py-3 gap-4">
                                <div>
                                    <p className="font-medium text-gray-800">{u.name}</p>
                                    <p className="text-sm text-gray-500">{u.email}</p>
                                    <p className="text-xs text-gray-400">Registered {new Date(u.createdAt).toLocaleDateString()}</p>
                                </div>
                                <button
                                    onClick={() => approve(u.id)}
                                    disabled={actionLoading === u.id + '_approve'}
                                    className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition shrink-0"
                                >
                                    {actionLoading === u.id + '_approve' ? '…' : 'Approve'}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* All users */}
            {!loading && (
                <section>
                    <h2 className="text-lg font-semibold mb-3">All Users ({users.length})</h2>
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                        {users.map(u => (
                            <div key={u.id} className="flex items-center justify-between px-5 py-3 gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${u.isApproved ? 'bg-green-400' : 'bg-yellow-400'}`} />
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-800 truncate">{u.name}
                                            {u.role === 'Admin' && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Admin</span>}
                                        </p>
                                        <p className="text-sm text-gray-500 truncate">{u.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {!u.isApproved && u.role === 'User' && (
                                        <button onClick={() => approve(u.id)} disabled={!!actionLoading}
                                            className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
                                            Approve
                                        </button>
                                    )}
                                    {u.isApproved && u.role === 'User' && (
                                        <button onClick={() => revoke(u.id)} disabled={!!actionLoading}
                                            className="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition">
                                            Revoke
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
