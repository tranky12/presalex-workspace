import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET /api/projects/[id]/tasks
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const tasks = await prisma.task.findMany({
        where: { projectId: id },
        include: {
            assignee: { select: { id: true, name: true, image: true } },
            creator: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({ tasks })
}

// POST /api/projects/[id]/tasks — create a task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { title, description, assigneeId, priority = "medium", dueDate, tags, slackRef } = body
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

    const task = await prisma.task.create({
        data: {
            projectId: id,
            title,
            description,
            assigneeId: assigneeId || null,
            priority,
            dueDate: dueDate ? new Date(dueDate) : null,
            tags: tags || [],
            slackRef,
            creatorId: session.user.id!,
        },
        include: {
            assignee: { select: { id: true, name: true, image: true } },
        },
    })

    return NextResponse.json({ task })
}
