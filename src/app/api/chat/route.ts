import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { chat, PERSONA_PROMPTS, AIProvider } from "@/lib/ai-providers"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await req.json()
        const { persona, message, sessionId, history = [] } = body

        if (!persona || !message) {
            return NextResponse.json({ error: "Missing persona or message" }, { status: 400 })
        }

        const systemPrompt = PERSONA_PROMPTS[persona]
        if (!systemPrompt) {
            return NextResponse.json({ error: "Unknown persona" }, { status: 400 })
        }

        // Load user's AI settings from DB
        const userSettings = await prisma.userSettings.findUnique({
            where: { userId: session.user.id! },
        })

        // Determine provider, model, and API key
        const provider = (userSettings?.aiProvider as AIProvider) ?? "gemini"
        const model = userSettings?.aiModel ?? "gemini-1.5-flash"

        // Get API key: prefer DB-saved key, fall back to env var
        let apiKey = ""
        const providerKeyMap: Record<AIProvider, string> = {
            gemini: userSettings?.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "",
            openai: userSettings?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "",
            claude: userSettings?.claudeApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
            azure: userSettings?.azureApiKey ?? process.env.AZURE_OPENAI_API_KEY ?? "",
        }
        apiKey = providerKeyMap[provider]

        if (!apiKey) {
            return NextResponse.json({
                error: `Chưa cấu hình API key cho ${provider}. Vào Settings → AI Model để thêm API key.`,
            }, { status: 400 })
        }

        // Call the AI
        const response = await chat({
            provider,
            model,
            apiKey,
            azureEndpoint: userSettings?.azureEndpoint ?? undefined,
            systemPrompt,
            history,
            message,
        })

        // Persist messages
        const sid = sessionId || `${session.user.id}-${Date.now()}`
        await prisma.message.createMany({
            data: [
                { userId: session.user.id!, persona, role: "user", content: message, sessionId: sid },
                { userId: session.user.id!, persona, role: "assistant", content: response, sessionId: sid },
            ],
        })

        return NextResponse.json({ response, sessionId: sid, provider, model })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error("Chat API error:", msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")
    const persona = searchParams.get("persona")

    const messages = await prisma.message.findMany({
        where: {
            userId: session.user.id!,
            ...(sessionId ? { sessionId } : {}),
            ...(persona ? { persona } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 50,
    })

    return NextResponse.json({ messages })
}
