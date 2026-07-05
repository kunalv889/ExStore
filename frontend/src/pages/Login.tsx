import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authService } from '../services/api'

function Spinner() {
    return (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    )
}

function StoreLogo({ size = 8 }: { size?: number }) {
    return (
        <div className={`w-${size} h-${size} rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200`}>
            <svg className={`w-${size / 2} h-${size / 2} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
        </div>
    )
}

export default function Login() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const res = await authService.login(email.trim(), password)
            login(res.data.token, res.data.user)
            navigate('/')
        } catch (err: any) {
            const data = err.response?.data
            if (err.response?.status === 403 && data?.status === 'pending') {
                navigate('/pending-approval')
            } else {
                setError(data?.message ?? 'Login failed. Please try again.')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex">
            {/* ── Left panel ── */}
            <div className="hidden lg:flex lg:w-5/12 xl:w-1/2 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 relative overflow-hidden flex-col justify-between p-12">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
                    <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-violet-400/10 blur-3xl" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-14">
                        <StoreLogo size={10} />
                        <span className="text-white font-bold text-xl tracking-tight">ExStore</span>
                    </div>
                    <h2 className="text-4xl font-bold text-white leading-tight mb-4">
                        Your personal<br />media vault
                    </h2>
                    <p className="text-indigo-200 text-lg leading-relaxed max-w-xs">
                        Store, organize and share your photos and videos — privately and securely.
                    </p>
                </div>
                <div className="relative z-10 grid grid-cols-3 gap-3 opacity-30">
                    {[28, 20, 24, 20, 28, 20].map((h, i) => (
                        <div key={i} style={{ height: `${h * 4}px` }} className="rounded-2xl bg-white/20" />
                    ))}
                </div>
            </div>

            {/* ── Right form panel ── */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-slate-50">
                <div className="w-full max-w-[360px]">
                    <div className="lg:hidden flex items-center gap-2.5 mb-8">
                        <StoreLogo size={8} />
                        <span className="font-bold text-slate-900 text-lg">ExStore</span>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
                        <p className="text-slate-500 text-sm">Sign in to your ExStore account</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition"
                                placeholder="you@example.com" autoComplete="email" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition"
                                placeholder="••••••••" autoComplete="current-password" />
                        </div>

                        {error && (
                            <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
                                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                                {error}
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-100 hover:shadow-lg hover:shadow-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-1">
                            {loading ? <><Spinner /> Signing in…</> : 'Sign In'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-slate-500 mt-7">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-indigo-600 hover:text-indigo-700 font-semibold">Sign up</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
