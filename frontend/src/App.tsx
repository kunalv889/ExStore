import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import PendingApproval from './pages/PendingApproval'
import PendingVerification from './pages/PendingVerification'
import VerifyEmail from './pages/VerifyEmail'
import Admin from './pages/Admin'
import MyShares from './pages/MyShares'
import SharedView from './pages/SharedView'
import Profile from './pages/Profile'
import Navigation from './components/Navigation'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
    const { isAuthenticated, isAdmin } = useAuth()
    if (!isAuthenticated) return <Navigate to="/login" replace />
    if (adminOnly && !isAdmin) return <Navigate to="/" replace />
    return <>{children}</>
}

function AppRoutes() {
    return (
        <div className="min-h-screen bg-slate-50">
            <Navigation />
            <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/pending-approval" element={<PendingApproval />} />
                <Route path="/pending-verification" element={<PendingVerification />} />
                <Route path="/verify-email" element={<VerifyEmail />} />

                {/* Protected routes */}
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/shares" element={<ProtectedRoute><MyShares /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

                {/* Public share viewer — no auth wrapper (handles auth internally) */}
                <Route path="/shared/:shareId" element={<SharedView />} />

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
