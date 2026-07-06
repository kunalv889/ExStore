import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface Props {
    src: string
    alt?: string
    className?: string
    /** If true, fetches with no auth header (e.g. public share URLs that already carry ?shareId=) */
    noAuth?: boolean
}

/**
 * Renders an image fetched via an authenticated request.
 * Converts the response to a blob object URL so the browser never needs to
 * send auth headers via the <img> element itself.
 *
 * For URLs that already carry a ?shareId= token (SharedView) pass noAuth=true
 * and the request is sent without an Authorization header.
 */
export default function SecureImage({ src, alt = '', className, noAuth = false }: Props) {
    const { token } = useAuth()
    const [objectUrl, setObjectUrl] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)
    const prevUrl = useRef<string | null>(null)

    useEffect(() => {
        if (!src) return
        if (!noAuth && !token) return

        let active = true
        const controller = new AbortController()

        const headers: Record<string, string> = {}
        if (!noAuth && token) headers['Authorization'] = `Bearer ${token}`

        fetch(src, { headers, signal: controller.signal, credentials: 'omit' })
            .then(r => {
                if (!r.ok) throw new Error(`${r.status}`)
                return r.blob()
            })
            .then(blob => {
                if (!active) return
                const url = URL.createObjectURL(blob)
                // Revoke the previous object URL to free memory
                if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
                prevUrl.current = url
                setObjectUrl(url)
                setFailed(false)
            })
            .catch(() => { if (active) setFailed(true) })

        return () => {
            active = false
            controller.abort()
        }
    // Only re-fetch when the source URL or auth token changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, token, noAuth])

    // Revoke object URL on unmount
    useEffect(() => {
        return () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current) }
    }, [])

    if (failed) {
        return (
            <div className={`flex items-center justify-center bg-slate-100 text-slate-300 text-xs ${className ?? ''}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
            </div>
        )
    }

    if (!objectUrl) {
        return <div className={`bg-slate-100 animate-pulse ${className ?? ''}`} />
    }

    return <img src={objectUrl} alt={alt} className={className} loading="lazy" />
}
