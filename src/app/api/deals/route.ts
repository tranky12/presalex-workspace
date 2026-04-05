import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET /api/deals
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const stage = searchParams.get("stage")

    const deals = await prisma.deal.findMany({
        where: {
            ownerId: session.user.id!,
            ...(stage ? { stage } : {}),
        },
        include: { client: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ deals })
}

// POST /api/deals
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { title, company, value, stage, industry, solution, notes, nextStep, meddicData } = body

    if (!title || !company) {
        return NextResponse.json({ error: "title and company required" }, { status: 400 })
    }

    const deal = await prisma.deal.create({
        data: {
            title, company,
            value: parseFloat(value) || 0,
            stage: stage || "discovery",
            industry, solution, notes, nextStep,
            meddicData: meddicData || {},
            ownerId: session.user.id!,
        },
    })

    return NextResponse.json({ deal })
}
