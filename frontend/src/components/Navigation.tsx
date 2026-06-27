import { Link } from 'react-router-dom'

export default function Navigation() {
    return (
        <nav className="bg-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link to="/" className="text-2xl font-bold text-blue-600">
                        ExStore
                    </Link>
                    <div className="flex gap-6">
                        <Link to="/" className="text-gray-700 hover:text-blue-600 transition">
                            Home
                        </Link>
                        <Link to="/photos" className="text-gray-700 hover:text-blue-600 transition">
                            Photos
                        </Link>
                        <Link to="/upload" className="text-gray-700 hover:text-blue-600 transition">
                            Upload
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    )
}
