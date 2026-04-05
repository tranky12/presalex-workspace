import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// POST /api/integrations/jira/create-ticket
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { dealId, summary, description } = await req.json()

    const userSettings = await prisma.userSettings.findUnique({
        where: { userId: session.user.id! },
    })

    if (!userSettings?.jiraHost || !userSettings?.jiraEmail || !userSettings?.jiraToken || !userSettings?.jiraProject) {
        return NextResponse.json({ error: "Jira not fully configured. Go to Settings → Integrations." }, { status: 400 })
    }

    let deal = null
    if (dealId) {
        deal = await prisma.deal.findUnique({ where: { id: dealId } })
    }

    const auth64 = Buffer.from(`${userSettings.jiraEmail}:${userSettings.jiraToken}`).toString("base64")

    const payload = {
        fields: {
            project: { key: userSettings.jiraProject },
            summary: summary || (deal ? `[PresaleX] ${deal.title} — ${deal.company}` : "New deal from PresaleX"),
            description: {
                type: "doc", version: 1,
                content: [{
                    type: "paragraph",
                    content: [{
                        type: "text",
                        text: description || (deal
                            ? `Deal won: ${deal.title}\nCompany: ${deal.company}\nValue: $${(deal.value || 0).toLocaleString()}\nSolution: ${deal.solution || "TBD"}\nMEDDIC Score: ${deal.score}/100`
                            : "New presale deal created from PresaleX workspace.")
                    }]
                }]
            },
            issuetype: { name: "Task" },
        }
    }

    const res = await fetch(`https://${userSettings.jiraHost}/rest/api/3/issue`, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth64}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
        return NextResponse.json({ error: `Jira error: ${data.errorMessages?.join(", ") || res.statusText}` }, { status: 500 })
    }

    return NextResponse.json({
        success: true,
        ticketKey: data.key,
        ticketUrl: `https://${userSettings.jiraHost}/browse/${data.key}`,
        message: `✅ Jira ticket created: ${data.key}`,
    })
}
