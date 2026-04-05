import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const settings = await prisma.userSettings.findUnique({
        where: { userId: session.user.id! },
    })

    // Mask API keys for display (show only last 4 chars)
    const masked = settings ? {
        ...settings,
        geminiApiKey: settings.geminiApiKey ? `...${settings.geminiApiKey.slice(-4)}` : "",
        openaiApiKey: settings.openaiApiKey ? `...${settings.openaiApiKey.slice(-4)}` : "",
        claudeApiKey: settings.claudeApiKey ? `...${settings.claudeApiKey.slice(-4)}` : "",
        azureApiKey: settings.azureApiKey ? `...${settings.azureApiKey.slice(-4)}` : "",
        jiraToken: settings.jiraToken ? `...${settings.jiraToken.slice(-4)}` : "",
        slackWebhook: settings.slackWebhook ? `...${settings.slackWebhook.slice(-8)}` : "",
    } : null

    return NextResponse.json({ settings: masked })
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    // Only update fields that are provided and not masked (i.e., not starting with "...")
    const cleanField = (v: string | undefined) => {
        if (!v || v.startsWith("...")) return undefined
        return v || null
    }

    const data = {
        aiProvider: body.aiProvider || "gemini",
        aiModel: body.aiModel || "gemini-1.5-flash",
        ...(cleanField(body.geminiApiKey) !== undefined && { geminiApiKey: cleanField(body.geminiApiKey) }),
        ...(cleanField(body.openaiApiKey) !== undefined && { openaiApiKey: cleanField(body.openaiApiKey) }),
        ...(cleanField(body.claudeApiKey) !== undefined && { claudeApiKey: cleanField(body.claudeApiKey) }),
        ...(cleanField(body.azureApiKey) !== undefined && { azureApiKey: cleanField(body.azureApiKey) }),
        ...(cleanField(body.azureEndpoint) !== undefined && { azureEndpoint: cleanField(body.azureEndpoint) }),
        ...(cleanField(body.slackWebhook) !== undefined && { slackWebhook: cleanField(body.slackWebhook) }),
        ...(body.jiraHost !== undefined && { jiraHost: body.jiraHost || null }),
        ...(body.jiraEmail !== undefined && { jiraEmail: body.jiraEmail || null }),
        ...(cleanField(body.jiraToken) !== undefined && { jiraToken: cleanField(body.jiraToken) }),
        ...(body.jiraProject !== undefined && { jiraProject: body.jiraProject || null }),
        ...(body.driveFolderId !== undefined && { driveFolderId: body.driveFolderId || null }),
    }

    const settings = await prisma.userSettings.upsert({
        where: { userId: session.user.id! },
        update: data,
        create: { userId: session.user.id!, ...data },
    })

    return NextResponse.json({ success: true, aiProvider: settings.aiProvider, aiModel: settings.aiModel })
}
