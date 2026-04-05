import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"
import { chat, PERSONA_PROMPTS, AIProvider } from "@/lib/ai-providers"

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { inputs } = await req.json()

    // Load skill
    const skill = await prisma.skill.findUnique({ where: { id: id } })
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 })

    // Load user settings for AI provider
    const userSettings = await prisma.userSettings.findUnique({
        where: { userId: session.user.id! },
    })

    const provider = (userSettings?.aiProvider as AIProvider) ?? "gemini"
    const model = userSettings?.aiModel ?? "gemini-1.5-flash"
    const providerKeyMap: Record<AIProvider, string> = {
        gemini: userSettings?.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "",
        openai: userSettings?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "",
        claude: userSettings?.claudeApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
        azure: userSettings?.azureApiKey ?? process.env.AZURE_OPENAI_API_KEY ?? "",
    }
    const apiKey = providerKeyMap[provider]

    if (!apiKey) {
        return NextResponse.json({ error: "API key not configured. Go to Settings → AI Model." }, { status: 400 })
    }

    // Fill in prompt template with input values
    let prompt = skill.promptTemplate
    const vars = inputs || {}
    for (const [key, value] of Object.entries(vars)) {
        prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), String(value))
    }

    // Get system prompt for persona
    const systemPrompt = PERSONA_PROMPTS[skill.persona] ?? PERSONA_PROMPTS.consultant

    const output = await chat({
        provider, model, apiKey,
        azureEndpoint: userSettings?.azureEndpoint ?? undefined,
        systemPrompt,
        history: [],
        message: prompt,
    })

    // Save run
    const run = await prisma.skillRun.create({
        data: {
            skillId: skill.id,
            userId: session.user.id!,
            inputs: inputs || {},
            output,
            provider,
            model,
        },
    })

    // Increment usage count
    await prisma.skill.update({
        where: { id: skill.id },
        data: { usageCount: { increment: 1 } },
    })

    return NextResponse.json({ output, runId: run.id, provider, model })
}
