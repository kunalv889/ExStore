import { Link } from 'react-router-dom'

export default function PendingApproval() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
                <div className="text-5xl mb-4">⏳</div>
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Waiting for Approval</h1>
                <p className="text-gray-500 mb-6">
                    Your account has been created successfully. An admin will review and approve your
                    request shortly. You'll be able to sign in once approved.
                </p>
                <Link to="/login"
                    className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">
                    Back to Sign In
                </Link>
            </div>
        </div>
    )
}
