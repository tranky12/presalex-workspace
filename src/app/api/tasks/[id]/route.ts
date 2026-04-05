import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/tasks/[id] — update task
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { title, description, status, priority, assigneeId, dueDate, tags } = body

    const task = await prisma.task.update({
        where: { id: id },
        data: {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(status !== undefined && { status, completedAt: status === "done" ? new Date() : null }),
            ...(priority !== undefined && { priority }),
            ...(assigneeId !== undefined && { assigneeId }),
            ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
            ...(tags !== undefined && { tags }),
        },
        include: {
            assignee: { select: { id: true, name: true, image: true } },
        },
    })

    return NextResponse.json({ task })
}

// DELETE /api/tasks/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await prisma.task.delete({ where: { id: id } })
    return NextResponse.json({ success: true })
}
