import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET /api/projects?workspaceId=xxx — list all projects in workspace
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get("workspaceId")
    const type = searchParams.get("type") // internal | external | all

    const projects = await prisma.project.findMany({
        where: {
            ...(workspaceId ? { workspaceId } : {}),
            ...(type && type !== "all" ? { type } : {}),
        },
        include: {
            members: {
                include: { user: { select: { id: true, name: true, image: true } } },
            },
            _count: { select: { tasks: true } },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    })

    // Add task stats per project
    const projectsWithStats = await Promise.all(
        projects.map(async (p) => {
            const taskCounts = await prisma.task.groupBy({
                by: ["status"],
                where: { projectId: p.id },
                _count: { id: true },
            })
            const statusMap: Record<string, number> = {}
            taskCounts.forEach(t => { statusMap[t.status] = t._count.id })
            const totalTasks = Object.values(statusMap).reduce((a, b) => a + b, 0)
            const doneTasks = statusMap.done || 0
            const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : p.progress
            return { ...p, taskCounts: statusMap, totalTasks, progress }
        })
    )

    return NextResponse.json({ projects: projectsWithStats })
}

// POST /api/projects — create project
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { workspaceId, title, description, type = "internal", priority = "medium", clientName, dealValue, startDate, dueDate, slackChannelId, tags } = body
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

    const project = await prisma.project.create({
        data: {
            workspaceId,
            title,
            description,
            type,
            priority,
            clientName,
            dealValue: dealValue ? parseFloat(dealValue) : null,
            startDate: startDate ? new Date(startDate) : null,
            dueDate: dueDate ? new Date(dueDate) : null,
            slackChannelId,
            tags: tags || [],
            ownerId: session.user.id!,
            members: {
                create: { userId: session.user.id!, role: "lead" },
            },
        },
        include: {
            members: { include: { user: { select: { id: true, name: true, image: true } } } },
            _count: { select: { tasks: true } },
        },
    })

    return NextResponse.json({ project })
}
