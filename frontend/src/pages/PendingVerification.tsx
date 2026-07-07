import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../services/api'

export default function PendingVerification() {
    const [searchParams] = useSearchParams()
    const email = searchParams.get('email') ?? ''
    const [resent, setResent] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleResend = async () => {
        if (!email) return
        setLoading(true)
        try {
            await authService.resendVerification(email)
            setResent(true)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-100 border border-slate-100 p-10 text-center">
                    {/* Icon */}
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-100">
                        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your inbox</h1>
                    <p className="text-slate-500 mb-2 leading-relaxed">
                        We've sent a verification link to
                    </p>
                    {email && (
                        <p className="font-semibold text-indigo-600 mb-6 break-all">{email}</p>
                    )}
                    <p className="text-slate-500 mb-8 text-sm leading-relaxed">
                        Click the link in the email to verify your address. After verification your account will be reviewed by an admin.
                    </p>

                    {resent ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-600 font-medium mb-6">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            Verification email resent!
                        </div>
                    ) : email ? (
                        <button
                            onClick={handleResend}
                            disabled={loading}
                            className="w-full py-2.5 mb-4 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            {loading
                                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Sending…</>
                                : 'Resend verification email'
                            }
                        </button>
                    ) : null}

                    <Link to="/login"
                        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                        Back to Sign In
                    </Link>
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Didn't receive it? Check your spam folder or resend above.
                </p>
            </div>
        </div>
    )
}
