import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { chat } from "@/lib/ai-providers"

// POST /api/slack/events — Slack Events API receiver
// This endpoint handles:
// 1. URL verification (challenge)
// 2. message.channels events → AI extracts task/deal info → creates Tasks
// 3. slash commands: /presalex
export async function POST(req: NextRequest) {
    const body = await req.json()

    // ─── 1. URL Verification Challenge ─────────────────────
    if (body.type === "url_verification") {
        return NextResponse.json({ challenge: body.challenge })
    }

    // ─── 2. Slack Retry header — acknowledge fast ──────────
    // Slack requires a <3s response — process async
    const response = NextResponse.json({ ok: true })

    // Process async (fire and forget)
    processSlackEvent(body).catch(console.error)

    return response
}

async function processSlackEvent(body: Record<string, unknown>) {
    try {
        const event = body.event as Record<string, unknown>
        if (!event) return

        const { type, text, user, channel, thread_ts, ts } = event as {
            type: string; text: string; user: string; channel: string; thread_ts?: string; ts: string
        }

        // Only process regular messages, not bot messages
        if (type !== "message" || (event.bot_id as string)) return
        if (!text || text.trim().length < 10) return

        // Find workspace settings that have this channel configured
        const wsSettings = await prisma.workspaceSettings.findFirst({
            where: { slackChannelIds: { has: channel } },
            include: { workspace: true },
        })
        if (!wsSettings) return

        // Use AI to classify and extract structured info from the message
        const msgUrl = `https://slack.com/archives/${channel}/p${ts.replace(".", "")}`
        const classified = await classifySlackMessage(text, wsSettings.workspace.id, msgUrl)

        if (classified?.createTask) {
            // Find the project linked to this Slack channel
            const project = await prisma.project.findFirst({
                where: { workspaceId: wsSettings.workspace.id, slackChannelId: channel },
            })

            if (project) {
                await prisma.task.create({
                    data: {
                        projectId: project.id,
                        title: classified.taskTitle,
                        description: classified.taskDescription + `\n\n[Slack](${msgUrl})`,
                        priority: classified.priority || "medium",
                        slackRef: msgUrl,
                        creatorId: undefined, // system-created
                    },
                })
                console.log(`[SlackBot] Created task "${classified.taskTitle}" in project ${project.title}`)
            }
        }

        if (classified?.updateDeal && classified.company) {
            // Try to update deal stage or notes if deal mentioned
            const deal = await prisma.deal.findFirst({
                where: {
                    workspaceId: wsSettings.workspace.id,
                    company: { contains: classified.company, mode: "insensitive" },
                },
            })
            if (deal) {
                await prisma.deal.update({
                    where: { id: deal.id },
                    data: {
                        notes: (deal.notes || "") + `\n\n[${new Date().toLocaleDateString()}] From Slack: ${classified.dealUpdate}`,
                        ...(classified.newStage && { stage: classified.newStage }),
                    },
                })
                console.log(`[SlackBot] Updated deal "${deal.title}"`)
            }
        }
    } catch (err) {
        console.error("[SlackBot] processSlackEvent error:", err)
    }
}

async function classifySlackMessage(text: string, workspaceId: string, msgUrl: string) {
    try {
        const prompt = `You are a Slack bot for a supply chain consulting presale team.
Analyze this Slack message and extract actionable information.

Message: "${text.substring(0, 800)}"

Return a JSON object (no markdown, just JSON) with:
{
  "createTask": true/false,        // should we create a task from this?
  "taskTitle": "short task title", // if createTask is true
  "taskDescription": "details",    // if createTask is true
  "priority": "low|medium|high|urgent",
  "updateDeal": true/false,        // does this mention a deal/client update?
  "company": "company name if mentioned, or null",
  "dealUpdate": "what changed in the deal",
  "newStage": "discovery|qualified|proposal|demo|negotiation|won|lost or null",
  "isNoise": true/false            // casual chat, emojis only, etc
}

Rules:
- Tasks: action items, follow-ups, assignments, deadlines
- Deal updates: client status changes, meeting outcomes, won/lost
- isNoise: greetings, reactions, short messages`

        const response = await chat({
            provider: "gemini",
            model: "gemini-1.5-flash",
            systemPrompt: "You are a Slack bot for a supply chain consulting presale team.",
            history: [],
            message: prompt,
            apiKey: "", // will use env var
        })

        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return null
        return JSON.parse(jsonMatch[0])
    } catch {
        return null
    }
}
