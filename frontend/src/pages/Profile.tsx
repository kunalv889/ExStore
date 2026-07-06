import { useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { profileService } from '../services/api'

function SaveIcon() {
    return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
    )
}

function Spinner() {
    return (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    )
}

export default function Profile() {
    const { user, updateUser } = useAuth()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // --- Avatar state ---
    const [avatarLoading, setAvatarLoading] = useState(false)
    const [avatarError, setAvatarError] = useState<string | null>(null)
    const [avatarKey, setAvatarKey] = useState(0) // bump to force img reload

    // --- Name state ---
    const [name, setName] = useState(user?.name ?? '')
    const [nameLoading, setNameLoading] = useState(false)
    const [nameSuccess, setNameSuccess] = useState(false)
    const [nameError, setNameError] = useState<string | null>(null)

    // --- Password state ---
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [pwLoading, setPwLoading] = useState(false)
    const [pwSuccess, setPwSuccess] = useState(false)
    const [pwError, setPwError] = useState<string | null>(null)

    // ---- Avatar handlers ----

    const handleAvatarClick = () => {
        if (!avatarLoading) fileInputRef.current?.click()
    }

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !user) return
        setAvatarError(null)
        setAvatarLoading(true)
        try {
            await profileService.uploadAvatar(file)
            updateUser({ ...user, hasAvatar: true })
            setAvatarKey(k => k + 1)
        } catch (err: any) {
            setAvatarError(err.response?.data || 'Failed to upload avatar')
        } finally {
            setAvatarLoading(false)
            // Reset input so the same file can be re-selected
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleRemoveAvatar = async () => {
        if (!user) return
        setAvatarError(null)
        setAvatarLoading(true)
        try {
            await profileService.deleteAvatar()
            updateUser({ ...user, hasAvatar: false })
            setAvatarKey(k => k + 1)
        } catch {
            setAvatarError('Failed to remove avatar')
        } finally {
            setAvatarLoading(false)
        }
    }

    // ---- Name handler ----

    const handleNameSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim() || !user) return
        setNameError(null)
        setNameSuccess(false)
        setNameLoading(true)
        try {
            const res = await profileService.updateProfile(name.trim())
            updateUser({ ...user, name: res.data.name })
            setName(res.data.name)
            setNameSuccess(true)
            setTimeout(() => setNameSuccess(false), 3000)
        } catch (err: any) {
            setNameError(err.response?.data || 'Failed to update name')
        } finally {
            setNameLoading(false)
        }
    }

    // ---- Password handler ----

    const handlePasswordSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setPwError(null)
        setPwSuccess(false)

        if (newPassword.length < 8) {
            setPwError('New password must be at least 8 characters')
            return
        }
        if (newPassword !== confirmPassword) {
            setPwError('Passwords do not match')
            return
        }

        setPwLoading(true)
        try {
            await profileService.changePassword(currentPassword, newPassword)
            setPwSuccess(true)
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setTimeout(() => setPwSuccess(false), 4000)
        } catch (err: any) {
            setPwError(err.response?.data || 'Failed to change password')
        } finally {
            setPwLoading(false)
        }
    }

    if (!user) return null

    const initials = user.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? 'U'
    const avatarSrc = user.hasAvatar ? `${profileService.avatarUrl(user.id)}?v=${avatarKey}` : null

    return (
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            {/* Page header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Profile Settings</h1>
                <p className="text-slate-500 text-sm mt-1">Manage your account details and security</p>
            </div>

            {/* ── Avatar Card ── */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Profile Picture</h2>
                <div className="flex items-center gap-5">
                    {/* Avatar preview */}
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={handleAvatarClick}
                            disabled={avatarLoading}
                            className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-indigo-100 hover:ring-indigo-300 transition focus:outline-none focus:ring-indigo-400 disabled:opacity-60"
                            title="Click to change avatar"
                        >
                            {avatarSrc ? (
                                <img
                                    src={avatarSrc}
                                    alt="Avatar"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center">
                                    <span className="text-white text-xl font-bold">{initials}</span>
                                </div>
                            )}
                        </button>
                        {avatarLoading && (
                            <div className="absolute inset-0 rounded-full bg-white/70 flex items-center justify-center">
                                <Spinner />
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={handleAvatarClick}
                            disabled={avatarLoading}
                            className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-60"
                        >
                            {avatarSrc ? 'Change photo' : 'Upload photo'}
                        </button>
                        {avatarSrc && (
                            <button
                                type="button"
                                onClick={handleRemoveAvatar}
                                disabled={avatarLoading}
                                className="px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition disabled:opacity-60"
                            >
                                Remove photo
                            </button>
                        )}
                        <p className="text-xs text-slate-400">JPEG, PNG, GIF or WebP · max 5 MB</p>
                    </div>

                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={handleAvatarChange}
                    />
                </div>
                {avatarError && (
                    <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{avatarError}</p>
                )}
            </section>

            {/* ── Name Card ── */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Display Name</h2>
                <form onSubmit={handleNameSave} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={80}
                            required
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={nameLoading || name.trim() === user.name}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                            {nameLoading ? <Spinner /> : <SaveIcon />}
                            Save name
                        </button>
                        {nameSuccess && (
                            <span className="text-sm text-emerald-600 font-medium">Name updated!</span>
                        )}
                        {nameError && (
                            <span className="text-sm text-rose-600">{nameError}</span>
                        )}
                    </div>
                </form>

                {/* Read-only email */}
                <div className="mt-5 pt-5 border-t border-slate-100">
                    <label className="block text-sm font-medium text-slate-500 mb-1.5">Email address</label>
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-200">{user.email}</p>
                    <p className="text-xs text-slate-400 mt-1">Email cannot be changed</p>
                </div>
            </section>

            {/* ── Password Card ── */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Change Password</h2>
                <form onSubmit={handlePasswordSave} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Current password</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={pwLoading}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                            {pwLoading ? <Spinner /> : <SaveIcon />}
                            Update password
                        </button>
                        {pwSuccess && (
                            <span className="text-sm text-emerald-600 font-medium">Password changed!</span>
                        )}
                        {pwError && (
                            <span className="text-sm text-rose-600">{pwError}</span>
                        )}
                    </div>
                </form>
            </section>
        </main>
    )
}
