"use client"
import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"

type Doc = { id: string; name: string; type: string; category: string; tags: string[]; fileSize: number; createdAt: string }

const CATEGORIES = [
    { value: "framework", label: "📋 Framework / Methodology" },
    { value: "case_study", label: "📊 Case Study" },
    { value: "template", label: "📐 Proposal Template" },
    { value: "competitor", label: "🔍 Competitor Analysis" },
    { value: "product", label: "📦 Product / Solution Info" },
    { value: "general", label: "📄 General Reference" },
]

export default function KnowledgePage() {
    const [uploading, setUploading] = useState(false)
    const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
    const [category, setCategory] = useState("general")
    const [tags, setTags] = useState("")
    const [docs, setDocs] = useState<Doc[]>([])
    const [loadingDocs, setLoadingDocs] = useState(false)
    const [search, setSearch] = useState("")

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return
        const file = acceptedFiles[0]
        setUploading(true)
        setUploadResult(null)

        const formData = new FormData()
        formData.append("file", file)
        formData.append("category", category)
        formData.append("tags", tags)

        try {
            const res = await fetch("/api/upload", { method: "POST", body: formData })
            const data = await res.json()
            setUploadResult({ success: !data.error, message: data.message || data.error })
            if (!data.error) loadDocs()
        } catch {
            setUploadResult({ success: false, message: "Upload failed — network error" })
        } finally {
            setUploading(false)
        }
    }, [category, tags])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        accept: {
            "application/pdf": [".pdf"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
            "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
            "text/plain": [".txt"],
            "text/markdown": [".md"],
        },
    })

    const [useRAG, setUseRAG] = useState(true)
    const [searchResults, setSearchResults] = useState<any[]>([])

    async function loadDocs() {
        setLoadingDocs(true)
        try {
            if (useRAG && search.trim()) {
                const res = await fetch("/api/knowledge/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: search })
                })
                const data = await res.json()
                setSearchResults(data.results || [])
            } else {
                const res = await fetch(`/api/upload?q=${encodeURIComponent(search)}`)
                const data = await res.json()
                setDocs(data.docs || [])
                setSearchResults([])
            }
        } catch { }
        setLoadingDocs(false)
    }

    const [syncing, setSyncing] = useState(false)

    async function syncGDrive() {
        setSyncing(true)
        try {
            const res = await fetch("/api/integrations/google-drive/sync", { method: "POST" })
            const data = await res.json()
            if (data.success) {
                alert(data.message)
                loadDocs()
            } else {
                alert(`Sync failed: ${data.error}`)
            }
        } catch {
            alert("Network error during sync.")
        }
        setSyncing(false)
    }

    const iconForType: Record<string, string> = { pdf: "📕", docx: "📘", pptx: "📊", text: "📄" }

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <h1 className="text-3xl font-bold text-white font-playfair">Knowledge Base</h1>
                <button
                    onClick={syncGDrive}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-cyan-500/30 text-cyan-400 bg-cyan-400/5 hover:bg-cyan-400/10 transition-all disabled:opacity-50"
                >
                    {syncing ? "⏳ Syncing..." : "☁️ Sync Google Drive"}
                </button>
            </div>
            <p className="text-gray-400 text-sm mb-8">Upload tài liệu SC&L — AI sẽ học từ nội dung để trả lời thông minh hơn.</p>

            <div className="grid grid-cols-2 gap-6">
                {/* Upload Panel */}
                <div className="space-y-4">
                    <div className="rounded-2xl border p-6" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)" }}>
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Upload Tài Liệu</h2>

                        {/* Category */}
                        <div className="mb-4">
                            <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 block">Phân loại</label>
                            <select value={category} onChange={e => setCategory(e.target.value)}
                                className="w-full rounded-xl px-4 py-2.5 text-sm text-white border outline-none"
                                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }}>
                                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>

                        {/* Tags */}
                        <div className="mb-5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 block">Tags (cách nhau bởi dấu phẩy)</label>
                            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. TMS, Vietnam, Blue Yonder"
                                className="w-full rounded-xl px-4 py-2.5 text-sm text-white border outline-none"
                                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }} />
                        </div>

                        {/* Drop Zone */}
                        <div
                            {...getRootProps()}
                            className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all"
                            style={{
                                borderColor: isDragActive ? "#00d4aa" : "rgba(255,255,255,0.12)",
                                background: isDragActive ? "rgba(0,212,170,0.06)" : "rgba(255,255,255,0.02)",
                            }}
                        >
                            <input {...getInputProps()} />
                            <div className="text-4xl mb-3">{uploading ? "⏳" : "📂"}</div>
                            <p className="text-sm text-white font-medium mb-1">
                                {uploading ? "Đang xử lý file..." : isDragActive ? "Thả file vào đây!" : "Kéo thả hoặc click để chọn file"}
                            </p>
                            <p className="text-xs text-gray-500">PDF, DOCX, PPTX, TXT, MD · Tối đa 20MB</p>
                        </div>

                        {/* Result */}
                        {uploadResult && (
                            <div className={`mt-4 p-3 rounded-xl text-sm border ${uploadResult.success
                                ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                : "text-red-400 border-red-500/30 bg-red-500/10"
                                }`}>
                                {uploadResult.message}
                            </div>
                        )}
                    </div>

                    {/* Supported formats */}
                    <div className="rounded-2xl border p-5" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)" }}>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Định dạng hỗ trợ</h3>
                        {[
                            { ext: "PDF", desc: "Báo cáo, RFP, tài liệu kỹ thuật", icon: "📕" },
                            { ext: "DOCX", desc: "Proposal draft, SOW, hợp đồng", icon: "📘" },
                            { ext: "PPTX", desc: "Slide deck, template presentation", icon: "📊" },
                            { ext: "TXT/MD", desc: "Notes, knowledge articles", icon: "📄" },
                        ].map(f => (
                            <div key={f.ext} className="flex items-center gap-3 py-2 border-b last:border-0 text-sm" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                                <span>{f.icon}</span>
                                <span className="font-mono text-cyan-400 text-xs w-14">{f.ext}</span>
                                <span className="text-gray-400 text-xs">{f.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Document Library */}
                <div className="rounded-2xl border p-6 flex flex-col h-full" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)" }}>
                    <div className="flex flex-col gap-3 mb-5">
                        <div className="flex items-center gap-3">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex-1">Thư viện tài liệu</h2>
                            <button
                                onClick={() => setUseRAG(!useRAG)}
                                className={`text-[10px] px-3 py-1 rounded-full border transition-all ${useRAG ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'text-gray-500 border-gray-700'}`}
                            >
                                {useRAG ? "✨ AI Smart Search ON" : "🔍 Keyword Search"}
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && loadDocs()}
                                placeholder={useRAG ? "Hỏi gì đó về tài liệu..." : "Tìm tên file..."}
                                className="text-xs flex-1 rounded-lg px-4 py-2 border outline-none text-white focus:border-cyan-500/50"
                                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }} />
                            <button onClick={loadDocs} className="text-xs px-4 py-2 rounded-lg border text-white font-bold"
                                style={{ borderColor: "#00d4aa", background: "rgba(0,212,170,0.15)" }}>
                                GO
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-[400px]">
                        {loadingDocs ? (
                            <div className="text-center py-12 text-gray-500">Đang tìm kiếm bằng AI...</div>
                        ) : (searchResults.length > 0) ? (
                            <div className="space-y-4">
                                <div className="text-[10px] text-cyan-400 mb-2 uppercase tracking-widest font-bold">Top AI Results</div>
                                {searchResults.map((res: any) => (
                                    <div key={res.id} className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 group cursor-pointer hover:bg-cyan-500/10 transition-all">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{res.name}</div>
                                            <div className="text-[10px] text-cyan-300 font-mono">{(res.similarity * 100).toFixed(1)}% Match</div>
                                        </div>
                                        <div className="text-xs text-gray-400 line-clamp-3 leading-relaxed italic">"{res.snippet}"</div>
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className="text-[9px] px-2 py-0.5 rounded bg-gray-800 text-gray-400 uppercase">{res.category}</span>
                                            <span className="text-[9px] text-gray-600">{new Date(res.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : docs.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="text-4xl mb-3">📁</div>
                                <p className="text-gray-400 text-sm">Chưa có tài liệu nào.</p>
                                <p className="text-gray-600 text-xs mt-1">Upload file đầu tiên để xây dựng knowledge base.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {docs.map(doc => (
                                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:border-cyan-500/30"
                                        style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
                                        <span className="text-xl">{iconForType[doc.type] || "📄"}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-white truncate">{doc.name}</div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-gray-500">{doc.category}</span>
                                                {doc.tags?.slice(0, 2).map(t => (
                                                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded border text-cyan-400"
                                                        style={{ borderColor: "rgba(0,212,170,0.2)", background: "rgba(0,212,170,0.06)" }}>{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-gray-600 text-right whitespace-nowrap">
                                            {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)}KB` : "—"}<br />
                                            {new Date(doc.createdAt).toLocaleDateString("vi-VN")}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
