import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../../auth"
import { prisma } from "@/lib/prisma"
import { embed } from "@/lib/ai-providers"

function cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0
    let dotProduct = 0
    let mag1 = 0
    let mag2 = 0
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i]
        mag1 += vec1[i] * vec1[i]
        mag2 += vec2[i] * vec2[i]
    }
    mag1 = Math.sqrt(mag1)
    mag2 = Math.sqrt(mag2)
    if (mag1 === 0 || mag2 === 0) return 0
    return dotProduct / (mag1 * mag2)
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { query, workspaceId: providedWorkspaceId } = await req.json()
        if (!query) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 })
        }

        // Get AI settings
        const settings = await prisma.userSettings.findUnique({
            where: { userId: session.user.id },
            select: { geminiApiKey: true, currentWorkspaceId: true }
        })

        const workspaceId = providedWorkspaceId || settings?.currentWorkspaceId
        if (!workspaceId) {
            return NextResponse.json({ error: "Workspace ID required" }, { status: 400 })
        }

        const apiKey = settings?.geminiApiKey
        if (!apiKey) {
            return NextResponse.json({ error: "Gemini API Key required for semantic search" }, { status: 400 })
        }

        // 1. Generate query embedding
        const queryEmbedding = await embed(query, apiKey)

        // 2. Fetch all docs with embeddings for this workspace
        const docs = await prisma.knowledgeDoc.findMany({
            where: {
                workspaceId,
                embedding: { isEmpty: false } // Only docs with embeddings
            },
            select: {
                id: true,
                name: true,
                category: true,
                content: true,
                embedding: true,
                createdAt: true
            }
        })

        // 3. Calculate similarities
        const results = docs.map(doc => {
            const similarity = cosineSimilarity(queryEmbedding, doc.embedding as number[])
            return {
                id: doc.id,
                name: doc.name,
                category: doc.category,
                // Return snippet
                snippet: doc.content.substring(0, 300) + "...",
                similarity,
                createdAt: doc.createdAt
            }
        })

        // 4. Sort and filter
        const sortedResults = results
            .filter(r => r.similarity > 0.4) // Threshold
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5) // Top 5

        return NextResponse.json({
            query,
            results: sortedResults,
            count: sortedResults.length,
            totalDocsSearched: docs.length
        })

    } catch (error) {
        console.error("Search API error:", error)
        return NextResponse.json({ error: "Search failed" }, { status: 500 })
    }
}
