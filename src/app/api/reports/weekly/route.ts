import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"
import { chat } from "@/lib/ai-providers"

// POST /api/reports/weekly — generate weekly BOD report
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { workspaceId, weekStart: weekStartStr } = await req.json()

    const weekStart = weekStartStr ? new Date(weekStartStr) : getLastFriday()
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    // Gather all data for the week
    const [deals, projects, tasks, knowledgeDocs] = await Promise.all([
        prisma.deal.findMany({
            where: {
                ...(workspaceId ? { workspaceId } : { owner: { id: session.user.id! } }),
                updatedAt: { gte: weekStart, lte: weekEnd },
            },
            orderBy: { value: "desc" },
            take: 20,
        }),
        prisma.project.findMany({
            where: {
                ...(workspaceId ? { workspaceId } : { ownerId: session.user.id! }),
                status: "active",
            },
            include: { _count: { select: { tasks: true } } },
        }),
        prisma.task.findMany({
            where: {
                updatedAt: { gte: weekStart, lte: weekEnd },
                project: workspaceId ? { workspaceId } : { ownerId: session.user.id! },
            },
            include: {
                project: { select: { title: true, type: true } },
                assignee: { select: { name: true } },
            },
        }),
        prisma.knowledgeDoc.findMany({
            where: {
                ...(workspaceId ? { workspaceId } : {}),
                createdAt: { gte: weekStart },
            },
            select: { name: true, category: true, createdAt: true },
            take: 10,
        }),
    ])

    // Compute stats
    const pipelineValue = (deals as any[]).reduce((a, d) => a + d.value, 0)
    const wonDeals = (deals as any[]).filter(d => d.stage === "won")
    const tasksDone = (tasks as any[]).filter(t => t.status === "done")
    const tasksTotal = tasks.length

    // Build data summary for AI
    const dataSummary = `
WEEKLY DATA SUMMARY (${weekStart.toLocaleDateString()} → ${weekEnd.toLocaleDateString()})

PIPELINE (${deals.length} deals updated this week):
${(deals as any[]).slice(0, 10).map(d => `- ${d.company}: ${d.stage} | $${(d.value / 1000).toFixed(0)}K | ${d.solution || "—"}`).join("\n")}
Total pipeline value: $${(pipelineValue / 1000000).toFixed(2)}M
Won this week: ${wonDeals.length} deals

PROJECTS (${projects.length} active):
${(projects as any[]).map(p => `- [${p.type.toUpperCase()}] ${p.title}: ${p._count.tasks} tasks, progress ${p.progress}%`).join("\n")}

TASKS THIS WEEK (${tasksTotal} total, ${tasksDone.length} completed):
${(tasks as any[]).slice(0, 15).map(t => `- [${t.status}] ${t.title} → ${t.project.title} [${t.assignee?.name || "Unassigned"}]`).join("\n")}

NEW KNOWLEDGE DOCS (${knowledgeDocs.length}):
${(knowledgeDocs as any[]).map(d => `- ${d.name} (${d.category || "general"})`).join("\n")}
`

    // Generate AI report in Vietnamese
    const prompt = `Bạn là senior partner tại Smartlog, đang viết báo cáo tuần cho BOD (Ban Giám Đốc).

Dữ liệu tuần này:
${dataSummary}

Hãy viết báo cáo BOD tuần trong định dạng markdown chuyên nghiệp, bằng **tiếng Việt**, bao gồm:

# 📊 Báo Cáo Tuần — [Ngày]

## 1. Tổng Quan Pipeline
- Tóm tắt tình hình deals, giá trị pipeline, thay đổi so với tuần trước

## 2. Highlights Tuần
- Thành tựu nổi bật (deals won, milestones)
- Rủi ro cần lưu ý

## 3. Về Các Dự Án
- Các dự án nội bộ/external đang chạy
- Task hoàn thành và tồn đọng

## 4. Đặc Thù Khách Hàng Đáng Chú Ý
- Các tình huống/yêu cầu đặc biệt từ khách hàng

## 5. Kiến Thức Bổ Sung
- Tài liệu/case study mới được thêm vào

## 6. Khuyến Nghị Tuần Tới
- 3 ưu tiên hàng đầu cho tuần sau

Tone: chuyên nghiệp, súc tích, dành cho senior management. Không dài dòng.`

    const reportContent = await chat({
        provider: "gemini",
        model: "gemini-1.5-pro",
        systemPrompt: "Bạn là senior partner tại Smartlog, đang viết báo cáo tuần cho BOD (Ban Giám Đốc).",
        history: [],
        message: prompt,
        apiKey: process.env.GEMINI_API_KEY || "",
    })

    // Save to DB
    const report = await prisma.report.create({
        data: {
            title: `Báo Cáo Tuần ${weekStart.toLocaleDateString("vi-VN")}`,
            type: "weekly_bod",
            workspaceId,
            content: reportContent,
            data: { deals: deals.length, pipelineValue, wonDeals: wonDeals.length, tasksTotal, tasksDone: tasksDone.length },
            generatedBy: session.user.id!,
            weekStart,
        },
    })

    return NextResponse.json({ report })
}

// GET /api/reports/weekly — list past reports
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get("workspaceId")

    const reports = await prisma.report.findMany({
        where: {
            ...(workspaceId ? { workspaceId } : { generatedBy: session.user.id! }),
            type: "weekly_bod",
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, title: true, weekStart: true, createdAt: true, data: true },
    })

    return NextResponse.json({ reports })
}

function getLastFriday(): Date {
    const now = new Date()
    const day = now.getDay() // 0 = Sun, 5 = Fri
    const daysBack = day >= 5 ? day - 5 : 7 + day - 5
    const friday = new Date(now)
    friday.setDate(now.getDate() - daysBack)
    friday.setHours(0, 0, 0, 0)
    return friday
}
