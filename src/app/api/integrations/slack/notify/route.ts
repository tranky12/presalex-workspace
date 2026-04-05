import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// POST /api/integrations/slack/notify — send a deal notification to Slack
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { dealId, event } = await req.json()

    const userSettings = await prisma.userSettings.findUnique({
        where: { userId: session.user.id! },
    })

    if (!userSettings?.slackWebhook) {
        return NextResponse.json({ error: "Slack webhook not configured. Go to Settings → Integrations." }, { status: 400 })
    }

    let deal = null
    if (dealId) {
        deal = await prisma.deal.findUnique({ where: { id: dealId } })
    }

    const stageEmoji: Record<string, string> = {
        won: "🏆", lost: "❌", qualified: "✅", proposal: "📄", demo: "🎯", negotiation: "🤝", discovery: "🔍",
    }

    const blocks = [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*${stageEmoji[event] || "📢"} PresaleX Deal Update*\n${deal
                    ? `*${deal.title}* — ${deal.company}\nStage: \`${event}\` | Value: $${(deal.value || 0).toLocaleString()}`
                    : event
                    }`,
            },
        },
        deal ? {
            type: "context",
            elements: [
                { type: "mrkdwn", text: `Solution: ${deal.solution || "—"} | Score: ${deal.score}/100` },
            ],
        } : null,
        {
            type: "actions",
            elements: [{
                type: "button",
                text: { type: "plain_text", text: "View in PresaleX" },
                url: `${process.env.NEXTAUTH_URL || "http://localhost:3001"}/deals`,
            }],
        },
    ].filter(Boolean)

    const res = await fetch(userSettings.slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
    })

    if (!res.ok) {
        return NextResponse.json({ error: `Slack error: ${res.status} ${res.statusText}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Slack notification sent!" })
}
