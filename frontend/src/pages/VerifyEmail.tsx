import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../services/api'

type Status = 'verifying' | 'success' | 'expired' | 'invalid' | 'error'

export default function VerifyEmail() {
    const [searchParams] = useSearchParams()
    const [status, setStatus] = useState<Status>('verifying')
    const [message, setMessage] = useState('')

    useEffect(() => {
        const token = searchParams.get('token')
        if (!token) { setStatus('invalid'); return }

        authService.verifyEmail(token)
            .then(res => {
                setStatus(res.data.status === 'success' ? 'success' : 'invalid')
                setMessage(res.data.message ?? '')
            })
            .catch(err => {
                const s = err.response?.data?.status
                setStatus(s === 'expired' ? 'expired' : s === 'invalid' ? 'invalid' : 'error')
                setMessage(err.response?.data?.message ?? 'Something went wrong.')
            })
    }, [])

    const config: Record<Status, { icon: React.ReactNode; iconBg: string; title: string; body: string }> = {
        verifying: {
            icon: <svg className="animate-spin w-10 h-10 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>,
            iconBg: 'from-indigo-500 to-violet-600',
            title: 'Verifying your email…',
            body: 'Please wait a moment.',
        },
        success: {
            icon: <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>,
            iconBg: 'from-emerald-400 to-teal-500',
            title: 'Email verified!',
            body: 'Your email has been confirmed. Your account is now awaiting admin approval — you\'ll be able to sign in once approved.',
        },
        expired: {
            icon: <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
            iconBg: 'from-amber-400 to-orange-500',
            title: 'Link expired',
            body: 'This verification link has expired. Sign in to receive a new one.',
        },
        invalid: {
            icon: <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
            iconBg: 'from-red-400 to-rose-500',
            title: 'Invalid link',
            body: 'This verification link is invalid or has already been used.',
        },
        error: {
            icon: <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>,
            iconBg: 'from-red-400 to-rose-500',
            title: 'Something went wrong',
            body: message || 'Please try again or contact support.',
        },
    }

    const c = config[status]

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-100 border border-slate-100 p-10 text-center">
                    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${c.iconBg} mx-auto mb-6 flex items-center justify-center shadow-lg`}>
                        {c.icon}
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">{c.title}</h1>
                    <p className="text-slate-500 mb-8 leading-relaxed">{c.body}</p>
                    {status !== 'verifying' && (
                        <Link to="/login"
                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold rounded-xl shadow-md shadow-indigo-100 hover:shadow-lg hover:shadow-indigo-200 hover:from-indigo-600 hover:to-violet-700 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                            Back to Sign In
                        </Link>
                    )}
                </div>
            </div>
        </div>
    )
}
