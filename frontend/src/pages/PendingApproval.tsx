import { Link } from 'react-router-dom'

export default function PendingApproval() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-100 border border-slate-100 p-10 text-center">
                    {/* Icon */}
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mx-auto mb-6 flex items-center justify-center shadow-lg shadow-orange-100">
                        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Pending approval</h1>
                    <p className="text-slate-500 mb-8 leading-relaxed">
                        Your account has been created. An admin will review and approve your
                        request shortly — you'll be able to sign in once approved.
                    </p>

                    <Link to="/login"
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold rounded-xl shadow-md shadow-indigo-100 hover:shadow-lg hover:shadow-indigo-200 hover:from-indigo-600 hover:to-violet-700 transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                        </svg>
                        Back to Sign In
                    </Link>
                </div>

                {/* Footer note */}
                <p className="text-center text-xs text-slate-400 mt-6">
                    If you haven't heard back after 24 hours, contact your admin.
                </p>
            </div>
        </div>
    )
}
