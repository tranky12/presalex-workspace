import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET /api/workspace/members?workspaceId=xxx
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get("workspaceId")
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 })

    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
            user: {
                select: { id: true, name: true, email: true, image: true, role: true, createdAt: true },
            },
        },
        orderBy: { joinedAt: "asc" },
    })

    return NextResponse.json({ members })
}

// PATCH /api/workspace/members — update member role or assigned projects
export async function PATCH(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { memberId, role, projectIds } = await req.json()

    const member = await prisma.workspaceMember.findUnique({
        where: { id: memberId },
        include: { workspace: true },
    })
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 })

    // Verify caller is admin/owner
    const isOwner = member.workspace.ownerId === session.user.id
    const isAdmin = await prisma.workspaceMember.findFirst({
        where: { workspaceId: member.workspaceId, userId: session.user.id!, role: { in: ["owner", "admin"] } },
    })
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const updated = await prisma.workspaceMember.update({
        where: { id: memberId },
        data: {
            ...(role !== undefined && { role }),
            ...(projectIds !== undefined && { projectIds }),
        },
        include: { user: { select: { name: true, email: true, image: true } } },
    })

    return NextResponse.json({ member: updated })
}

// DELETE /api/workspace/members — remove a member
export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { memberId } = await req.json()
    const member = await prisma.workspaceMember.findUnique({
        where: { id: memberId },
        include: { workspace: true },
    })
    if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const isOwner = member.workspace.ownerId === session.user.id
    if (!isOwner) return NextResponse.json({ error: "Only owner can remove members" }, { status: 403 })

    await prisma.workspaceMember.delete({ where: { id: memberId } })
    return NextResponse.json({ success: true })
}
