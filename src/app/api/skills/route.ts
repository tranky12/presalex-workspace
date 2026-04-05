import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"
import { chat, PERSONA_PROMPTS, AIProvider } from "@/lib/ai-providers"

// ──────────────────────────────────────────────────────────
// GET /api/skills — list all skills
// ──────────────────────────────────────────────────────────
export async function GET() {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const skills = await prisma.skill.findMany({
        orderBy: [{ isBuiltin: "desc" }, { usageCount: "desc" }],
        include: { _count: { select: { runs: true } } },
    })

    return NextResponse.json({ skills })
}

// ──────────────────────────────────────────────────────────
// POST /api/skills — create a custom skill
// ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { name, description, icon, persona, category, promptTemplate, variables } = body

    if (!name || !promptTemplate) {
        return NextResponse.json({ error: "name and promptTemplate are required" }, { status: 400 })
    }

    const skill = await prisma.skill.create({
        data: {
            name, description: description || "", icon: icon || "🛠️",
            persona: persona || "consultant", category: category || "custom",
            promptTemplate, variables: variables || [],
            createdBy: session.user.id,
        },
    })

    return NextResponse.json({ skill })
}
