import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import PendingApproval from './pages/PendingApproval'
import Admin from './pages/Admin'
import Navigation from './components/Navigation'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
    const { isAuthenticated, isAdmin } = useAuth()
    if (!isAuthenticated) return <Navigate to="/login" replace />
    if (adminOnly && !isAdmin) return <Navigate to="/" replace />
    return <>{children}</>
}

function AppRoutes() {
    return (
        <div className="min-h-screen bg-gray-50">
            <Navigation />
            <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/pending-approval" element={<PendingApproval />} />

                {/* Protected routes */}
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />

                {/* Admin only */}
                <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    )
}

function App() {
    return (
        <Router>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </Router>
    )
}

export default App
