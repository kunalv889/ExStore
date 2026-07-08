import { createContext, useContext, useEffect, useState } from 'react'

export interface AuthUser {
    id: string
    email: string
    name: string
    role: 'Admin' | 'User'
    isApproved: boolean
    isEmailVerified: boolean
    hasAvatar?: boolean
}

interface AuthContextType {
    user: AuthUser | null
    token: string | null
    login: (token: string, user: AuthUser) => void
    logout: () => void
    updateUser: (user: AuthUser) => void
    isAuthenticated: boolean
    isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'))
    const [user, setUser] = useState<AuthUser | null>(() => {
        const stored = localStorage.getItem('auth_user')
        return stored ? JSON.parse(stored) : null
    })

    // Auto-logout when JWT expires
    useEffect(() => {
        if (!token) return
        try {
            const payload = JSON.parse(atob(token.split('.')[1]))
            const expiresIn = (payload.exp * 1000) - Date.now()
            if (expiresIn <= 0) { logout(); return }
            const timer = setTimeout(logout, expiresIn)
            return () => clearTimeout(timer)
        } catch { logout() }
    }, [token])

    const login = (newToken: string, newUser: AuthUser) => {
        localStorage.setItem('auth_token', newToken)
        localStorage.setItem('auth_user', JSON.stringify(newUser))
        setToken(newToken)
        setUser(newUser)
    }

    const logout = () => {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
        setToken(null)
        setUser(null)
    }

    const updateUser = (newUser: AuthUser) => {
        localStorage.setItem('auth_user', JSON.stringify(newUser))
        setUser(newUser)
    }

    return (
        <AuthContext.Provider value={{
            user, token,
            login, logout, updateUser,
            isAuthenticated: !!token && !!user,
            isAdmin: user?.role === 'Admin'
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
    return ctx
}
