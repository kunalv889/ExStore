import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navigation() {
    const { user, isAuthenticated, isAdmin, logout } = useAuth()
    const navigate = useNavigate()

    if (!isAuthenticated) return null

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <nav className="bg-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link to="/" className="text-2xl font-bold text-blue-600">
                        ExStore
                    </Link>
                    <div className="flex items-center gap-6">
                        <Link to="/" className="text-gray-700 hover:text-blue-600 transition text-sm">Home</Link>
                        <Link to="/photos" className="text-gray-700 hover:text-blue-600 transition text-sm">Files</Link>
                        <Link to="/upload" className="text-gray-700 hover:text-blue-600 transition text-sm">Upload</Link>
                        {isAdmin && (
                            <Link to="/admin" className="text-gray-700 hover:text-blue-600 transition text-sm font-medium">Admin</Link>
                        )}
                        <div className="flex items-center gap-3 border-l pl-4">
                            <span className="text-sm text-gray-600 hidden sm:block">{user?.name}</span>
                            <button onClick={handleLogout}
                                className="text-sm text-red-500 hover:text-red-700 transition font-medium">
                                Sign out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    )
}
