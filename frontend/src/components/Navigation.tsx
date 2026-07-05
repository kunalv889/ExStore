import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navigation() {
    const { user, isAuthenticated, isAdmin, logout } = useAuth()
    const navigate = useNavigate()

    if (!isAuthenticated) return null

    const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? 'U'

    return (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/70 shadow-sm shadow-slate-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14">

                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2.5 group">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm transition-all group-hover:shadow-md group-hover:shadow-indigo-200">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-900 tracking-tight">ExStore</span>
                    </Link>

                    {/* Right side */}
                    <div className="flex items-center gap-1">
                    {/* Nav links */}
                    <Link to="/shares"
                        className="text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all">
                        Shares
                    </Link>
                    {isAdmin && (
                        <Link to="/admin"
                            className="text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all">
                            Admin
                        </Link>
                    )}

                        <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-200">
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center ring-2 ring-white shadow-sm shrink-0">
                                <span className="text-white text-xs font-bold">{initials}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-[140px] truncate">{user?.name}</span>
                            <button
                                onClick={() => { logout(); navigate('/login') }}
                                className="text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition-all">
                                Sign out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}
