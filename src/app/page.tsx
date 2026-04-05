import { auth } from "@/../../auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user
  const userId = user.id

  // 1. Get user settings to find current workspace
  const settings = await prisma.userSettings.findUnique({
    where: { userId: userId! },
    select: { currentWorkspaceId: true }
  })
  const workspaceId = settings?.currentWorkspaceId

  // 2. Fetch KPI Data
  const [activeDealsCount, totalPipeline, proposalsInProgress, winRateData, recentDeals, recentTasks] = await Promise.all([
    // Active Opportunities
    prisma.deal.count({
      where: {
        workspaceId,
        stage: { notIn: ["won", "lost"] }
      }
    }),
    // Pipeline Value
    prisma.deal.aggregate({
      where: { workspaceId },
      _sum: { value: true }
    }),
    // Proposals (Active external projects)
    prisma.project.count({
      where: { workspaceId, type: "external", status: "active" }
    }),
    // Win Rate (Won / Won + Lost)
    prisma.deal.groupBy({
      by: ["stage"],
      where: { workspaceId, stage: { in: ["won", "lost"] } },
      _count: { _all: true }
    }),
    // Recent Dashboard Pipeline (Top 5)
    prisma.deal.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 5
    }),
    // Recent Activity (Tasks)
    prisma.task.findMany({
      where: { project: { workspaceId } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { project: true }
    })
  ])

  // Calculate Win Rate
  const wonCount = winRateData.find((d: any) => d.stage === "won")?._count._all || 0
  const lostCount = winRateData.find((d: any) => d.stage === "lost")?._count._all || 0
  const winRate = (wonCount + lostCount) > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0

  const pipelineValue = totalPipeline._sum.value || 0
  const kpis = [
    { icon: "💼", value: String(activeDealsCount), label: "Active Opportunities", change: "Real-time", up: true },
    { icon: "💰", value: `$${(pipelineValue / 1000000).toFixed(1)}M`, label: "Pipeline Value", change: "Total deal value", up: true },
    { icon: "📄", value: String(proposalsInProgress), label: "Proposals In Progress", change: "Active projects", up: true },
    { icon: "✅", value: `${winRate}%`, label: "Win Rate (LTM)", change: "Based on won/lost", up: winRate > 50 },
  ]

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white font-playfair">
          Good afternoon, {user.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          Pipeline overview · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} · Powered by Gemini AI
        </p>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {kpis.map((stat, i) => (
          <div key={i} className="rounded-2xl p-5 border transition-all hover:-translate-y-1" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)", backdropFilter: "blur(12px)" }}>
            <div className="text-2xl mb-3">{stat.icon}</div>
            <div className="text-3xl font-extrabold text-white mb-1">{stat.value}</div>
            <div className="text-xs text-gray-400 mb-2">{stat.label}</div>
            <div className={`text-[10px] flex items-center gap-1 ${stat.up ? "text-emerald-400" : "text-amber-400 uppercase tracking-tighter"}`}>
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      {/* Visual Pipeline Chart */}
      <div className="mb-8 rounded-2xl border p-6" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)", backdropFilter: "blur(12px)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-6 font-playfair tracking-normal">Pipeline Value by Stage</h2>
        <div className="flex items-end gap-1 h-32 px-4">
          {[
            { stage: "Discovery", value: 1200000, color: "#22d3ee" },
            { stage: "Qualified", value: 850000, color: "#3b82f6" },
            { stage: "Proposal", value: 1800000, color: "#a855f7" },
            { stage: "Negotiation", value: 1050000, color: "#10b981" },
            { stage: "Closed Won", value: 600000, color: "#00d4aa" },
          ].map((bar, i) => {
            const height = (bar.value / 2000000) * 100
            return (
              <div key={i} className="flex-1 flex flex-col items-center group">
                <div className="text-[10px] text-gray-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  ${(bar.value / 1000).toFixed(0)}K
                </div>
                <div
                  className="w-full rounded-t-lg transition-all hover:brightness-125 cursor-help"
                  style={{ height: `${height}%`, background: bar.color, boxShadow: `0 0 15px ${bar.color}33` }}
                ></div>
                <div className="mt-2 text-[10px] text-gray-500 uppercase tracking-tighter truncate w-full text-center">
                  {bar.stage}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pipeline + Quick Actions */}
      <div className="grid grid-cols-2 gap-6">
        {/* Active Pipeline */}
        <div className="rounded-2xl border p-6" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Active Pipeline</h2>
            <a href="/deals" className="text-xs text-cyan-400 hover:text-cyan-300">View All →</a>
          </div>

          {recentDeals.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No deals found in this workspace.</div>
          ) : (
            recentDeals.map((deal: any, i: number) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">{deal.company}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{deal.title}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${deal.stage === 'won' ? 'bg-emerald-500/20 text-emerald-400' :
                  deal.stage === 'lost' ? 'bg-red-500/20 text-red-400' :
                    'bg-cyan-500/20 text-cyan-400'
                  }`}>{deal.stage}</span>
                <div className="text-sm font-bold text-amber-400 min-w-[70px] text-right">
                  ${(deal.value / 1000).toFixed(0)}K
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick Actions + Activity */}
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border p-6" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)", backdropFilter: "blur(12px)" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/proposals", icon: "📐", label: "New Proposal", primary: true },
                { href: "/deals", icon: "🎯", label: "Qualify Deal", primary: false },
                { href: "/clients", icon: "🔍", label: "Client Profile", primary: false },
                { href: "/chat", icon: "🧠", label: "Ask Expert", primary: false },
                { href: "/knowledge", icon: "📄", label: "Upload Docs", primary: false },
                { href: "/projects", icon: "🗂️", label: "Manage Projects", primary: false },
              ].map((action, i) => (
                <a key={i} href={action.href} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 ${action.primary
                  ? "text-black"
                  : "text-white border hover:border-cyan-500/40"
                  }`}
                  style={action.primary
                    ? { background: "linear-gradient(135deg,#00d4aa,#3b82f6)", boxShadow: "0 4px 15px rgba(0,212,170,0.3)" }
                    : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }
                  }>
                  {action.icon} {action.label}
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-6 flex-1" style={{ background: "rgba(13,21,39,0.7)", borderColor: "rgba(0,212,170,0.12)", backdropFilter: "blur(12px)" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Recent Activity</h2>
            {recentTasks.length === 0 ? (
              <div className="text-gray-600 text-xs text-center py-8">No recent activity detected.</div>
            ) : (
              recentTasks.map((item: any, i: number) => (
                <div key={i} className="relative pl-5 pb-4 last:pb-0" style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 8px rgba(0,212,170,0.4)" }}></div>
                  <div className="text-[10px] text-gray-500 mb-1 ml-3">{new Date(item.updatedAt).toLocaleString("vi-VN")}</div>
                  <div className="text-sm text-white ml-3 font-medium">{item.status.toUpperCase()}: {item.title}</div>
                  <div className="text-xs text-gray-500 ml-3 mt-0.5">Project: {item.project.title}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
