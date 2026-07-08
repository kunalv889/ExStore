import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/api'

function Spinner() {
    return (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    )
}

export default function Register() {
    const navigate = useNavigate()
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (password.length < 8) { setError('Password must be at least 8 characters'); return }
        setError(null)
        setLoading(true)
        try {
            await authService.register(name.trim(), email.trim(), password)
            navigate(`/pending-verification?email=${encodeURIComponent(email.trim())}`)
        } catch (err: any) {
            setError(err.response?.data ?? err.response?.data?.message ?? 'Registration failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex">
            {/* ── Left panel ── */}
            <div className="hidden lg:flex lg:w-5/12 xl:w-1/2 bg-gradient-to-br from-violet-600 via-indigo-700 to-indigo-800 relative overflow-hidden flex-col justify-between p-12">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-indigo-400/10 blur-3xl" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-14">
                        <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <span className="text-white font-bold text-xl tracking-tight">ExStore</span>
                    </div>
                    <h2 className="text-4xl font-bold text-white leading-tight mb-4">
                        Join the<br />private cloud
                    </h2>
                    <p className="text-indigo-200 text-lg leading-relaxed max-w-xs">
                        Create your account and get secure access to your personal media library.
                    </p>
                    <div className="mt-10 p-4 bg-white/10 backdrop-blur rounded-2xl border border-white/10">
                        <p className="text-indigo-100 text-sm">
                            <span className="font-semibold text-white">Admin approval required.</span>{' '}
                            After signing up, an admin will review and activate your account.
                        </p>
                    </div>
                </div>
                <div className="relative z-10 grid grid-cols-3 gap-3 opacity-25">
                    {[20, 28, 20, 28, 20, 28].map((h, i) => (
                        <div key={i} style={{ height: `${h * 4}px` }} className="rounded-2xl bg-white/20" />
                    ))}
                </div>
            </div>

            {/* ── Right form panel ── */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-slate-50">
                <div className="w-full max-w-[380px]">
                    <div className="lg:hidden flex items-center gap-2.5 mb-8">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-900 text-lg">ExStore</span>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-slate-900 mb-1">Create an account</h1>
                        <p className="text-slate-500 text-sm">Get started with ExStore today</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
                            <input type="text" required value={name} onChange={e => setName(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition"
                                placeholder="Your name" autoComplete="name" />
                        </div>
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
                                placeholder="At least 8 characters" autoComplete="new-password" />
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
                            {loading ? <><Spinner /> Creating account…</> : 'Create Account'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-slate-500 mt-7">
                        Already have an account?{' '}
                        <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
