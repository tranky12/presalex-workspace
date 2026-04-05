import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET /api/admin/users — list all users (admin only)
export async function GET() {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Check admin role
    const currentUser = await prisma.user.findUnique({ where: { id: session.user.id! } })
    if (currentUser?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
    }

    const users = await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        include: {
            _count: { select: { deals: true, messages: true } },
            settings: { select: { aiProvider: true, aiModel: true } },
        },
    })

    return NextResponse.json({ users })
}

// PATCH /api/admin/users — update user role
export async function PATCH(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const currentUser = await prisma.user.findUnique({ where: { id: session.user.id! } })
    if (currentUser?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { userId, role } = await req.json()
    if (!["admin", "consultant", "viewer"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    const updated = await prisma.user.update({ where: { id: userId }, data: { role } })
    return NextResponse.json({ success: true, user: { id: updated.id, role: updated.role } })
}
