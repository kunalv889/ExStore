import { useEffect, useState } from 'react'
import { galleryService } from '../services/api'

export default function Home() {
    const [galleries, setGalleries] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadGalleries = async () => {
            try {
                const response = await galleryService.getGalleries()
                setGalleries(response.data)
            } catch (error) {
                console.error('Failed to load galleries:', error)
            } finally {
                setLoading(false)
            }
        }
        loadGalleries()
    }, [])

    if (loading) {
        return <div className="text-center py-12">Loading galleries...</div>
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-8">My Photo & Video Gallery</h1>

            {galleries.length === 0 ? (
                <div className="text-center py-12 bg-gray-100 rounded-lg">
                    <p className="text-gray-600 mb-4">No galleries yet. Create one to get started!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {galleries.map((gallery) => (
                        <div key={gallery.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition">
                            <div className="h-48 bg-gray-200 flex items-center justify-center">
                                <span className="text-gray-400">[Gallery Preview]</span>
                            </div>
                            <div className="p-4">
                                <h2 className="text-xl font-semibold mb-2">{gallery.name}</h2>
                                <p className="text-gray-600 text-sm">{gallery.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
