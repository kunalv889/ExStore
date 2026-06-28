import { useRef, useState } from 'react'
import { fileService } from '../services/api'

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

interface FileEntry {
    file: File
    status: FileStatus
    error?: string
    progress?: number
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_ICON: Record<FileStatus, string> = {
    pending: '⏳',
    uploading: '⬆️',
    done: '✅',
    error: '❌',
}

export default function Upload() {
    const [entries, setEntries] = useState<FileEntry[]>([])
    const [uploading, setUploading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const updateEntry = (index: number, patch: Partial<FileEntry>) =>
        setEntries(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e))

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length === 0) return
        setEntries(prev => [
            ...prev,
            ...files.map(f => ({ file: f, status: 'pending' as FileStatus }))
        ])
        // reset input so the same file can be re-added if removed
        e.target.value = ''
    }

    const removeEntry = (index: number) =>
        setEntries(prev => prev.filter((_, i) => i !== index))

    const clearAll = () => setEntries([])

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault()
        const pending = entries.filter(en => en.status === 'pending' || en.status === 'error')
        if (pending.length === 0) return

        setUploading(true)
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            if (entry.status !== 'pending' && entry.status !== 'error') continue
            updateEntry(i, { status: 'uploading', error: undefined, progress: 0 })
            try {
                const formData = new FormData()
                formData.append('file', entry.file)
                await fileService.uploadFile(formData, pct => updateEntry(i, { progress: pct }))
                updateEntry(i, { status: 'done', progress: 100 })
            } catch {
                updateEntry(i, { status: 'error', error: 'Upload failed', progress: undefined })
            }
        }
        setUploading(false)
    }

    const pendingCount = entries.filter(e => e.status === 'pending' || e.status === 'error').length
    const doneCount = entries.filter(e => e.status === 'done').length
    const hasEntries = entries.length > 0

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-8">Upload Photos, Videos & ZIPs</h1>

            <form onSubmit={handleUpload} className="bg-white rounded-lg shadow-md p-8">

                {/* Drop zone / file picker */}
                <div
                    className="mb-6 border-2 border-dashed border-blue-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
                    onClick={() => inputRef.current?.click()}
                >
                    <div className="text-3xl mb-2">📁</div>
                    <p className="text-sm font-medium text-blue-600">Click to choose files</p>
                    <p className="text-xs text-gray-400 mt-1">Images, Videos, ZIP archives · Multiple files supported</p>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        accept="image/*,video/*,.zip,application/zip,application/x-zip-compressed"
                        className="hidden"
                    />
                </div>

                {/* File list */}
                {hasEntries && (
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">
                                {entries.length} file{entries.length !== 1 ? 's' : ''} selected
                                {doneCount > 0 && ` · ${doneCount} uploaded`}
                            </span>
                            {!uploading && (
                                <button type="button" onClick={clearAll}
                                    className="text-xs text-gray-400 hover:text-red-500 transition">
                                    Clear all
                                </button>
                            )}
                        </div>
                        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                            {entries.map((entry, i) => (
                                <li key={i} className={`px-4 py-2.5 text-sm
                                    ${entry.status === 'done' ? 'bg-green-50' : ''}
                                    ${entry.status === 'error' ? 'bg-red-50' : ''}
                                    ${entry.status === 'uploading' ? 'bg-blue-50' : ''}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-base w-5 shrink-0">{STATUS_ICON[entry.status]}</span>
                                        <span className="flex-1 truncate text-gray-700" title={entry.file.name}>
                                            {entry.file.name}
                                        </span>
                                        <span className="text-gray-400 text-xs shrink-0">{formatBytes(entry.file.size)}</span>
                                        {entry.status === 'uploading' && entry.progress !== undefined && (
                                            <span className="text-blue-600 text-xs font-medium shrink-0 text-right">
                                                {entry.progress < 100 ? `${entry.progress}%` : 'Processing…'}
                                            </span>
                                        )}
                                        {entry.error && <span className="text-red-500 text-xs shrink-0">{entry.error}</span>}
                                        {entry.status !== 'uploading' && !uploading && (
                                            <button type="button" onClick={() => removeEntry(i)}
                                                className="text-gray-300 hover:text-red-400 transition shrink-0 text-base leading-none">
                                                ×
                                            </button>
                                        )}
                                    </div>
                                    {entry.status === 'uploading' && entry.progress !== undefined && (
                                        <div className="mt-1.5 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                                            {entry.progress < 100 ? (
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all duration-200"
                                                    style={{ width: `${entry.progress}%` }}
                                                />
                                            ) : (
                                                <div className="h-full w-full bg-blue-400 rounded-full animate-pulse" />
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={uploading || pendingCount === 0}
                    className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                >
                    {uploading
                        ? `Uploading… (${doneCount} / ${entries.length})`
                        : pendingCount > 0
                            ? `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`
                            : 'All files uploaded'}
                </button>
            </form>
        </div>
    )
}
