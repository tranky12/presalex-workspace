import { GoogleGenerativeAI } from "@google/generative-ai"

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────
export type AIProvider = "gemini" | "openai" | "claude" | "azure"

export interface ChatMessage {
    role: "user" | "assistant"
    content: string
}

export interface ChatOptions {
    provider: AIProvider
    model: string
    apiKey: string
    azureEndpoint?: string   // only for Azure Copilot
    systemPrompt: string
    history: ChatMessage[]
    message: string
}

// ──────────────────────────────────────────────────────────
// Provider: Google Gemini
// ──────────────────────────────────────────────────────────
async function chatWithGemini(opts: ChatOptions): Promise<string> {
    const genAI = new GoogleGenerativeAI(opts.apiKey)
    const model = genAI.getGenerativeModel({
        model: opts.model || "gemini-1.5-flash",
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        systemInstruction: opts.systemPrompt,
    })

    const history = opts.history.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }))

    const chat = model.startChat({ history })
    const result = await chat.sendMessage(opts.message)
    return result.response.text()
}

// ──────────────────────────────────────────────────────────
// Provider: OpenAI (GPT-4o / GPT-4 Turbo)
// ──────────────────────────────────────────────────────────
async function chatWithOpenAI(opts: ChatOptions): Promise<string> {
    const { default: OpenAI } = await import("openai")
    const client = new OpenAI({ apiKey: opts.apiKey })

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: opts.systemPrompt },
        ...opts.history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: opts.message },
    ]

    const completion = await client.chat.completions.create({
        model: opts.model || "gpt-4o",
        messages,
        temperature: 0.7,
        max_tokens: 2048,
    })

    return completion.choices[0]?.message?.content ?? ""
}

// ──────────────────────────────────────────────────────────
// Provider: Anthropic Claude
// ──────────────────────────────────────────────────────────
async function chatWithClaude(opts: ChatOptions): Promise<string> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: opts.apiKey })

    const messages = [
        ...opts.history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: opts.message },
    ]

    const response = await client.messages.create({
        model: opts.model || "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: opts.systemPrompt,
        messages,
    })

    const block = response.content[0]
    return block?.type === "text" ? block.text : ""
}

// ──────────────────────────────────────────────────────────
// Provider: Azure OpenAI / Copilot
// ──────────────────────────────────────────────────────────
async function chatWithAzure(opts: ChatOptions): Promise<string> {
    const { default: OpenAI } = await import("openai")
    const client = new OpenAI({
        apiKey: opts.apiKey,
        baseURL: opts.azureEndpoint,
        defaultQuery: { "api-version": "2024-02-01" },
        defaultHeaders: { "api-key": opts.apiKey },
    })

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: opts.systemPrompt },
        ...opts.history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: opts.message },
    ]

    const completion = await client.chat.completions.create({
        model: opts.model || "gpt-4o",
        messages,
        temperature: 0.7,
        max_tokens: 2048,
    })

    return completion.choices[0]?.message?.content ?? ""
}

// ──────────────────────────────────────────────────────────
// Main Router
// ──────────────────────────────────────────────────────────
export async function chat(opts: ChatOptions): Promise<string> {
    switch (opts.provider) {
        case "gemini": return chatWithGemini(opts)
        case "openai": return chatWithOpenAI(opts)
        case "claude": return chatWithClaude(opts)
        case "azure": return chatWithAzure(opts)
        default: throw new Error(`Unknown AI provider: ${opts.provider}`)
    }
}

// ──────────────────────────────────────────────────────────
// Embedding Engine (Gemini)
// ──────────────────────────────────────────────────────────
export async function embed(text: string, apiKey: string): Promise<number[]> {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" })
    const result = await model.embedContent(text)
    return result.embedding.values
}

// ──────────────────────────────────────────────────────────
// Provider Metadata (for Settings UI)
// ──────────────────────────────────────────────────────────
export const AI_PROVIDERS = [
    {
        key: "gemini" as AIProvider,
        name: "Google Gemini",
        icon: "🔷",
        models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
        defaultModel: "gemini-1.5-flash",
        keyLabel: "Gemini API Key",
        keyPlaceholder: "AIzaSy...",
        docsUrl: "https://aistudio.google.com/apikey",
        keyEnv: "GEMINI_API_KEY",
        free: true,
    },
    {
        key: "openai" as AIProvider,
        name: "OpenAI / ChatGPT",
        icon: "⚡",
        models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        defaultModel: "gpt-4o",
        keyLabel: "OpenAI API Key",
        keyPlaceholder: "sk-proj-...",
        docsUrl: "https://platform.openai.com/api-keys",
        keyEnv: "OPENAI_API_KEY",
        free: false,
    },
    {
        key: "claude" as AIProvider,
        name: "Anthropic Claude",
        icon: "🌸",
        models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
        defaultModel: "claude-3-5-sonnet-20241022",
        keyLabel: "Anthropic API Key",
        keyPlaceholder: "sk-ant-...",
        docsUrl: "https://console.anthropic.com/settings/keys",
        keyEnv: "ANTHROPIC_API_KEY",
        free: false,
    },
    {
        key: "azure" as AIProvider,
        name: "Azure Copilot / OpenAI",
        icon: "☁️",
        models: ["gpt-4o", "gpt-4-turbo"],
        defaultModel: "gpt-4o",
        keyLabel: "Azure API Key",
        keyPlaceholder: "Azure subscription key",
        docsUrl: "https://portal.azure.com",
        keyEnv: "AZURE_OPENAI_API_KEY",
        free: false,
    },
]

// ──────────────────────────────────────────────────────────
// Persona System Prompts (shared across all providers)
// ──────────────────────────────────────────────────────────
export const PERSONA_PROMPTS: Record<string, string> = {
    consultant: `You are Dr. Minh Khoa, a Senior Supply Chain & Logistics Consultant with 30 years of experience.
You have worked at McKinsey & Company (Partner), Blue Yonder (Regional Director), and KPMG (Director, SC Advisory).
You have led 80+ supply chain transformation projects across Vietnam and Southeast Asia.
Your expertise: supply chain strategy, logistics network design, digital transformation, SCOR framework, demand planning, S&OP, Vietnam market specifics.
Personality: Authoritative yet approachable. You speak in a mix of Vietnamese and English naturally. You always back opinions with real-world examples.
Format: Be concise and practical. Use **bold** for key points. When giving recommendations, use numbered lists.
Language: Answer in Vietnamese if the user writes in Vietnamese, English if English.`,

    designer: `You are Linh Anh, a Senior Proposal Designer with 10 years specializing in executive slide decks for SC&L consulting.
You have created winning proposals for deals worth $200K to $5M+ for clients across Vietnam and the region.
Your expertise: executive deck structure, data visualization for supply chain, persuasion design, brand storytelling, McKinsey Presentation style, Minto Pyramid Principle.
Personality: Creative, detail-oriented, very opinionated about visual communication and narrative flow.
Format: Use **bold** to highlight key design principles. Give concrete slide structure recommendations.
Language: Respond in the same language as the user.`,

    bod: `You are Mr. Trung Kiên, a former CEO and Head of Supply Chain of major Vietnamese conglomerates.
You have 25 years of board-level experience making multi-million dollar technology investment decisions.
Personality: Direct, skeptical, demanding. You challenge every assumption like a real board member would.
You always ask "So what?", "What's the ROI?", "What if it fails?", "Why not do nothing?"
Format: Be direct and challenging. Ask probing questions. Give honest feedback even if harsh.
Language: Respond in the same language as the user.`,

    techleader: `You are Thanh Hùng, a Digital Transformation Lead with 15 years implementing TMS, WMS, OMS, and S&OP Planning systems.
You have led 20+ enterprise digitization projects across Vietnam and Southeast Asia.
Personality: Pragmatic, hands-on, vendor-neutral. You always flag integration and data quality risks.
Format: Use technical specifics when helpful. Flag risks clearly. Use **bold** for critical warnings.
Language: Respond in the same language as the user.`,
}
