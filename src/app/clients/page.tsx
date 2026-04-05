"use client"
import { useState, useEffect } from "react"

type Client = {
    id: string; name: string; industry: string; size: string
    contact: string; phone: string; email: string; address: string
    painPoints: string[]; maturityLevel: number; notes: string
}

const PAIN_POINTS = [
    { key: "visibility", label: "📊 Visibility", desc: "Thiếu real-time visibility" },
    { key: "inventory", label: "📦 Inventory", desc: "Tồn kho không chính xác" },
    { key: "planning", label: "📅 Planning", desc: "S&OP/demand planning thủ công" },
    { key: "transport", label: "🚛 Transportation", desc: "Chi phí vận chuyển cao" },
    { key: "warehouse", label: "🏭 Warehouse", desc: "Vận hành kho kém hiệu quả" },
    { key: "order", label: "📋 Order Management", desc: "Xử lý đơn hàng chậm" },
    { key: "returns", label: "🔄 Returns", desc: "Quản lý hoàn hàng phức tạp" },
    { key: "reporting", label: "📈 Reporting", desc: "Báo cáo chậm, thủ công" },
    { key: "integration", label: "🔗 Integration", desc: "Hệ thống bị phân mảnh" },
    { key: "compliance", label: "⚖️ Compliance", desc: "Tuân thủ quy định phức tạp" },
    { key: "supplier", label: "🤝 Supplier", desc: "Quản lý NCC kém" },
    { key: "customer", label: "👤 Customer", desc: "Trải nghiệm KH không tốt" },
]

const MATURITY_LEVELS = [
    { level: 1, label: "Initial", color: "#ef4444", desc: "Processes ad-hoc, paper-based" },
    { level: 2, label: "Developing", color: "#f59e0b", desc: "Basic systems, Excel-driven" },
    { level: 3, label: "Defined", color: "#3b82f6", desc: "Core systems in place" },
    { level: 4, label: "Managed", color: "#8b5cf6", desc: "Integrated systems, KPIs tracked" },
    { level: 5, label: "Optimized", color: "#10b981", desc: "AI-driven, continuous improvement" },
]

const RECOMMENDATIONS: Record<string, string[]> = {
    visibility: ["Real-time Control Tower", "TMS visibility module"],
    inventory: ["WMS with cycle count", "Demand-driven replenishment"],
    planning: ["S&OP Planning platform", "Demand sensing AI"],
    transport: ["TMS route optimization", "Carrier management"],
    order: ["OMS with auto-routing", "Order orchestration"],
    returns: ["Returns management module", "Reverse logistics process"],
    reporting: ["BI dashboard integration", "Real-time data lake"],
    integration: ["API middleware platform", "Integration hub"],
    compliance: ["Track and trace", "Regulatory reporting"],
    supplier: ["Supplier portal", "VMI / Collaborative replenishment"],
    customer: ["Customer portal", "Delivery promise engine"],
}

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [selected, setSelected] = useState<Client | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({ name: "", industry: "", size: "", contact: "", phone: "", email: "", address: "", notes: "", maturityLevel: "2" })
    const [selectedPains, setSelectedPains] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => { loadClients() }, [])

    async function loadClients() {
        const res = await fetch("/api/clients")
        const data = await res.json()
        setClients(data.clients || [])
    }

    async function saveClient() {
        setSaving(true)
        const res = await fetch("/api/clients", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, painPoints: selectedPains }),
        })
        const data = await res.json()
        if (!data.error) { loadClients(); setShowForm(false); setSelectedPains([]) }
        setSaving(false)
    }

    const togglePain = (key: string) =>
        setSelectedPains(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key])

    const selectedRecs = selected
        ? [...new Set(selected.painPoints.flatMap(p => RECOMMENDATIONS[p] || []))]
        : []

    const maturityInfo = selected ? MATURITY_LEVELS.find(m => m.level === selected.maturityLevel)! : null

    const fi = (label: string, key: keyof typeof form, ph = "") => (
        <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</label>
            <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={ph}
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white border outline-none"
                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }} />
        </div>
    )

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white font-playfair mb-1">Client Intelligence</h1>
                    <p className="text-gray-400 text-sm">Client profiles, pain point mapping, and solution recommendations.</p>
                </div>
                <button onClick={() => setShowForm(!showForm)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black"
                    style={{ background: "linear-gradient(135deg,#00d4aa,#3b82f6)", boxShadow: "0 4px 15px rgba(0,212,170,0.3)" }}>
                    + New Client
                </button>
            </div>

            {/* Create Form */}
            {showForm && (
                <div className="rounded-2xl border p-6 mb-6" style={{ background: "rgba(13,21,39,0.8)", borderColor: "rgba(0,212,170,0.2)" }}>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-400 mb-4">Client Profile</h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        {fi("Company Name *", "name", "e.g. Saigon Co.op Distribution")}
                        {fi("Industry", "industry", "e.g. Retail / FMCG / 3PL")}
                        {fi("Company Size", "size", "e.g. 2000 employees, 15 DCs")}
                        {fi("Key Contact", "contact", "e.g. Nguyễn Văn An")}
                        {fi("Phone", "phone", "+84 909 ...")}
                        {fi("Email", "email", "contact@company.com")}
                    </div>

                    {/* Digital Maturity */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Digital Maturity Level</label>
                        <div className="flex gap-2">
                            {MATURITY_LEVELS.map(m => (
                                <button key={m.level} onClick={() => setForm(p => ({ ...p, maturityLevel: String(m.level) }))}
                                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
                                    style={{
                                        borderColor: form.maturityLevel === String(m.level) ? m.color : "rgba(255,255,255,0.08)",
                                        background: form.maturityLevel === String(m.level) ? `${m.color}22` : "rgba(255,255,255,0.03)",
                                        color: form.maturityLevel === String(m.level) ? m.color : "rgba(136,146,164,1)",
                                    }}>
                                    {m.level}<br /><span className="font-normal">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Pain Points */}
                    <div className="mb-5">
                        <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Pain Points (select all that apply)</label>
                        <div className="grid grid-cols-4 gap-2">
                            {PAIN_POINTS.map(p => (
                                <button key={p.key} onClick={() => togglePain(p.key)}
                                    className="py-2.5 px-3 rounded-xl text-xs text-left border transition-all"
                                    style={{
                                        borderColor: selectedPains.includes(p.key) ? "#00d4aa" : "rgba(255,255,255,0.07)",
                                        background: selectedPains.includes(p.key) ? "rgba(0,212,170,0.1)" : "rgba(255,255,255,0.03)",
                                        color: selectedPains.includes(p.key) ? "#00d4aa" : "rgba(136,146,164,1)",
                                    }}>
                                    <div className="font-semibold">{p.label}</div>
                                    <div className="text-[10px] mt-0.5 opacity-70">{p.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={saveClient} disabled={saving}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black disabled:opacity-40"
                            style={{ background: "linear-gradient(135deg,#00d4aa,#3b82f6)" }}>
                            {saving ? "Saving..." : "✅ Save Client"}
                        </button>
                        <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm text-gray-400 border"
                            style={{ borderColor: "rgba(255,255,255,0.1)" }}>Cancel</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-3 gap-5">
                {/* Client List */}
                <div className="space-y-3">
                    {clients.length === 0 ? (
                        <div className="text-center py-12 rounded-2xl border" style={{ background: "rgba(13,21,39,0.5)", borderColor: "rgba(255,255,255,0.06)" }}>
                            <p className="text-4xl mb-3">🏢</p>
                            <p className="text-gray-400 text-sm">No clients yet.</p>
                        </div>
                    ) : clients.map(client => (
                        <div key={client.id} onClick={() => setSelected(client === selected ? null : client)}
                            className="rounded-xl border p-4 cursor-pointer transition-all hover:-translate-y-0.5"
                            style={{
                                background: selected?.id === client.id ? "rgba(0,212,170,0.07)" : "rgba(13,21,39,0.7)",
                                borderColor: selected?.id === client.id ? "rgba(0,212,170,0.4)" : "rgba(255,255,255,0.07)",
                            }}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                                    style={{ background: "linear-gradient(135deg,rgba(0,212,170,0.2),rgba(59,130,246,0.2))", border: "1px solid rgba(0,212,170,0.2)" }}>
                                    🏢
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-white truncate">{client.name}</div>
                                    <div className="text-xs text-gray-400 truncate">{client.industry || "—"}</div>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                    <div className="text-xs font-bold" style={{ color: MATURITY_LEVELS.find(m => m.level === client.maturityLevel)?.color }}>
                                        L{client.maturityLevel}
                                    </div>
                                    <div className="text-[10px] text-gray-600">{client.painPoints.length} pains</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Client Detail Panel */}
                <div className="col-span-2">
                    {!selected ? (
                        <div className="rounded-2xl border h-full flex items-center justify-center" style={{ background: "rgba(13,21,39,0.5)", borderColor: "rgba(255,255,255,0.06)" }}>
                            <div className="text-center py-16">
                                <p className="text-4xl mb-3">👈</p>
                                <p className="text-gray-400 text-sm">Select a client to view profile</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="rounded-2xl border p-5" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)" }}>
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                                        <p className="text-sm text-gray-400">{selected.industry} · {selected.size}</p>
                                    </div>
                                    {maturityInfo && (
                                        <div className="text-right">
                                            <div className="text-2xl font-black" style={{ color: maturityInfo.color }}>L{maturityInfo.level}</div>
                                            <div className="text-xs font-bold" style={{ color: maturityInfo.color }}>{maturityInfo.label}</div>
                                            <div className="text-[10px] text-gray-500">{maturityInfo.desc}</div>
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-xs">
                                    {[["Contact", selected.contact], ["Phone", selected.phone], ["Email", selected.email]].map(([k, v]) => v ? (
                                        <div key={k}><span className="text-gray-500">{k}: </span><span className="text-gray-300">{v}</span></div>
                                    ) : null)}
                                </div>
                            </div>

                            {/* Pain Points */}
                            <div className="rounded-2xl border p-5" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)" }}>
                                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Pain Points</h3>
                                <div className="flex flex-wrap gap-2">
                                    {selected.painPoints.map(pk => {
                                        const p = PAIN_POINTS.find(x => x.key === pk)!
                                        return p ? (
                                            <span key={pk} className="text-xs px-3 py-1.5 rounded-lg font-medium"
                                                style={{ background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.25)", color: "#00d4aa" }}>
                                                {p.label}
                                            </span>
                                        ) : null
                                    })}
                                    {selected.painPoints.length === 0 && <span className="text-xs text-gray-500">No pain points recorded</span>}
                                </div>
                            </div>

                            {/* Recommendations */}
                            {selectedRecs.length > 0 && (
                                <div className="rounded-2xl border p-5" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(59,130,246,0.15)" }}>
                                    <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">💡 Recommended Solutions</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedRecs.map(rec => (
                                            <div key={rec} className="text-xs px-3 py-2.5 rounded-lg border"
                                                style={{ background: "rgba(59,130,246,0.07)", borderColor: "rgba(59,130,246,0.2)", color: "#93c5fd" }}>
                                                → {rec}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
