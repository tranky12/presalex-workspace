import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET /api/workspace/join-request?workspaceId=xxx — list pending requests (admin)
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get("workspaceId")

    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 })

    // verify caller is owner or admin of this workspace
    const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: session.user.id!, role: { in: ["owner", "admin"] } },
    })
    const isOwner = await prisma.workspace.findFirst({ where: { id: workspaceId, ownerId: session.user.id! } })
    if (!membership && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const requests = await prisma.joinRequest.findMany({
        where: { workspaceId, status: "pending" },
        include: { user: { select: { id: true, name: true, email: true, image: true, createdAt: true } } },
        orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({ requests })
}

// POST /api/workspace/join-request — request to join a workspace
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { workspaceId, workspaceSlug, message } = await req.json()

    let wsId = workspaceId
    if (!wsId && workspaceSlug) {
        const ws = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } })
        if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
        wsId = ws.id
    }
    if (!wsId) return NextResponse.json({ error: "workspaceId or workspaceSlug required" }, { status: 400 })

    // Check if already a member
    const existing = await prisma.workspaceMember.findFirst({ where: { workspaceId: wsId, userId: session.user.id! } })
    if (existing) return NextResponse.json({ error: "Already a member" }, { status: 400 })

    // Upsert request
    const request = await prisma.joinRequest.upsert({
        where: { workspaceId_userId: { workspaceId: wsId, userId: session.user.id! } },
        update: { status: "pending", message },
        create: { workspaceId: wsId, userId: session.user.id!, message },
        include: { workspace: { select: { name: true, slug: true } } },
    })

    return NextResponse.json({ request })
}

// PATCH /api/workspace/join-request — approve or reject
export async function PATCH(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { requestId, action, role = "member" } = await req.json() // action: approve | reject

    const joinRequest = await prisma.joinRequest.findUnique({
        where: { id: requestId },
        include: { workspace: true },
    })
    if (!joinRequest) return NextResponse.json({ error: "Request not found" }, { status: 404 })

    // Verify admin
    const isOwner = joinRequest.workspace.ownerId === session.user.id
    const isMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: joinRequest.workspaceId, userId: session.user.id!, role: { in: ["owner", "admin"] } },
    })
    if (!isOwner && !isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (action === "approve") {
        // Add as member + update request
        await prisma.$transaction([
            prisma.workspaceMember.upsert({
                where: { workspaceId_userId: { workspaceId: joinRequest.workspaceId, userId: joinRequest.userId } },
                update: { role },
                create: { workspaceId: joinRequest.workspaceId, userId: joinRequest.userId, role },
            }),
            prisma.joinRequest.update({
                where: { id: requestId },
                data: { status: "approved", reviewedBy: session.user.id!, reviewedAt: new Date() },
            }),
        ])
        return NextResponse.json({ success: true, action: "approved" })
    } else {
        await prisma.joinRequest.update({
            where: { id: requestId },
            data: { status: "rejected", reviewedBy: session.user.id!, reviewedAt: new Date() },
        })
        return NextResponse.json({ success: true, action: "rejected" })
    }
}
