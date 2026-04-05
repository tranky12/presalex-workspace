import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET — list workspaces the current user belongs to
export async function GET() {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const memberships = await prisma.workspaceMember.findMany({
        where: { userId: session.user.id! },
        include: {
            workspace: {
                include: {
                    owner: { select: { name: true, email: true, image: true } },
                    _count: { select: { members: true, projects: true, deals: true } },
                },
            },
        },
    })

    const ownedWorkspaces = await prisma.workspace.findMany({
        where: { ownerId: session.user.id! },
        include: {
            owner: { select: { name: true, email: true, image: true } },
            _count: { select: { members: true, projects: true, deals: true } },
        },
    })

    // Merge and deduplicate
    const all = [
        ...ownedWorkspaces.map(w => ({ ...w, memberRole: "owner" })),
        ...memberships
            .filter(m => m.workspaceId !== ownedWorkspaces.find(o => o.id === m.workspaceId)?.id)
            .map(m => ({ ...m.workspace, memberRole: m.role })),
    ]

    return NextResponse.json({ workspaces: all })
}

// POST — create a new workspace
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { name, description } = await req.json()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })

    // Generate slug from name
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .substring(0, 40) + "-" + Date.now().toString(36)

    const workspace = await prisma.workspace.create({
        data: {
            name,
            slug,
            description,
            ownerId: session.user.id!,
            members: {
                create: {
                    userId: session.user.id!,
                    role: "owner",
                },
            },
            settings: { create: {} },
        },
        include: { _count: { select: { members: true, projects: true } } },
    })

    // Update user's current workspace
    await prisma.userSettings.upsert({
        where: { userId: session.user.id! },
        update: { currentWorkspaceId: workspace.id },
        create: { userId: session.user.id!, currentWorkspaceId: workspace.id },
    })

    return NextResponse.json({ workspace })
}
