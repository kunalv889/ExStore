import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Gallery from './pages/Gallery'
import Upload from './pages/Upload'
import Photos from './pages/Photos'
import Navigation from './components/Navigation'

function App() {
    return (
        <Router>
            <div className="min-h-screen bg-gray-50">
                <Navigation />
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/photos" element={<Photos />} />
                    <Route path="/gallery/:id" element={<Gallery />} />
                    <Route path="/upload" element={<Upload />} />
                </Routes>
            </div>
        </Router>
    )
}

export default App
