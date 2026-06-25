import { useParams } from 'react-router-dom'

export default function Gallery() {
    const { id } = useParams<{ id: string }>()

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-8">Gallery: {id}</h1>
            <div className="text-center py-12 bg-gray-100 rounded-lg">
                <p className="text-gray-600">Gallery items will be displayed here</p>
            </div>
        </div>
    )
}
