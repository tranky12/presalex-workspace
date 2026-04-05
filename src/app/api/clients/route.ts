import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const clients = await prisma.client.findMany({ where: { ownerId: session.user.id! }, orderBy: { updatedAt: "desc" } })
    return NextResponse.json({ clients })
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await req.json()
    const client = await prisma.client.create({
        data: { ...body, maturityLevel: parseInt(body.maturityLevel) || 2, painPoints: body.painPoints || [], ownerId: session.user.id! },
    })
    return NextResponse.json({ client })
}
