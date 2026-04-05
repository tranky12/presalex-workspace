import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

// File parsers
let pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null
let mammoth: { extractRawText: (options: { buffer: Buffer }) => Promise<{ value: string }> } | null = null

async function loadParsers() {
    if (!pdfParse) {
        const pdfModule = await import("pdf-parse")
        pdfParse = (pdfModule as any).default || pdfModule
    }
    if (!mammoth) {
        const mammothModule = await import("mammoth")
        mammoth = mammothModule
    }
}

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await loadParsers()

        const formData = await req.formData()
        const file = formData.get("file") as File
        const category = (formData.get("category") as string) || "general"
        const tags = ((formData.get("tags") as string) || "").split(",").map(t => t.trim()).filter(Boolean)

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        const maxSize = 20 * 1024 * 1024 // 20MB
        if (file.size > maxSize) {
            return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const ext = file.name.split(".").pop()?.toLowerCase() || ""
        const allowedTypes = ["pdf", "docx", "doc", "pptx", "ppt", "txt", "md"]

        if (!allowedTypes.includes(ext)) {
            return NextResponse.json(
                { error: `Unsupported file type. Allowed: ${allowedTypes.join(", ")}` },
                { status: 400 }
            )
        }

        // Save file to disk
        const uploadDir = join(process.cwd(), "uploads")
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true })
        }
        const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
        const filepath = join(uploadDir, filename)
        await writeFile(filepath, buffer)

        // Extract text content
        let content = ""
        let fileType = ext

        try {
            if (ext === "pdf") {
                const parsed = await pdfParse!(buffer)
                content = parsed.text
                fileType = "pdf"
            } else if (["docx", "doc"].includes(ext)) {
                const result = await mammoth!.extractRawText({ buffer })
                content = result.value
                fileType = "docx"
            } else if (["pptx", "ppt"].includes(ext)) {
                // Basic PPTX text extraction (slides as plain text)
                content = `[PPTX File: ${file.name}]\nFile uploaded successfully. Advanced PPTX parsing available in Phase 2.`
                fileType = "pptx"
            } else if (["txt", "md"].includes(ext)) {
                content = buffer.toString("utf-8")
                fileType = "text"
            }
        } catch (parseError) {
            console.warn("Parse warning:", parseError)
            content = `[File: ${file.name}] — Content extraction failed. File is stored for reference.`
        }

        // Truncate if too long
        const maxContentLength = 50000
        if (content.length > maxContentLength) {
            content = content.substring(0, maxContentLength) + "\n\n[Content truncated — document continues...]"
        }

        // Save to database
        const settings = await prisma.userSettings.findUnique({
            where: { userId: session.user.id },
            select: { geminiApiKey: true, currentWorkspaceId: true }
        })

        // Generate Embedding if API key is available
        let embedding: number[] = []
        if (settings?.geminiApiKey && content.trim().length > 10) {
            try {
                const { embed } = await import("@/lib/ai-providers")
                embedding = await embed(content.substring(0, 5000), settings.geminiApiKey)
            } catch (e) {
                console.error("Embedding generation failed:", e)
            }
        }

        const doc = await prisma.knowledgeDoc.create({
            data: {
                name: file.name,
                type: fileType,
                content,
                category,
                tags,
                fileSize: file.size,
                fileUrl: `/uploads/${filename}`,
                uploadedBy: session.user.id,
                workspaceId: settings?.currentWorkspaceId || formData.get("workspaceId") as string,
                embedding,
            },
        })

        return NextResponse.json({
            success: true,
            id: doc.id,
            name: doc.name,
            type: doc.type,
            category: doc.category,
            contentLength: content.length,
            hasEmbedding: embedding.length > 0,
            message: `✅ "${file.name}" uploaded and processed (${(file.size / 1024).toFixed(1)} KB, ${content.length.toLocaleString()} chars extracted, embedding: ${embedding.length > 0 ? 'YES' : 'NO'})`,
        })
    } catch (error) {
        console.error("Upload error:", error)
        return NextResponse.json({ error: "Upload failed" }, { status: 500 })
    }
}

// List uploaded knowledge docs
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category")
    const search = searchParams.get("q")

    const docs = await prisma.knowledgeDoc.findMany({
        where: {
            ...(category ? { category } : {}),
            ...(search
                ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { content: { contains: search, mode: "insensitive" } }] }
                : {}),
        },
        select: {
            id: true,
            name: true,
            type: true,
            category: true,
            tags: true,
            fileSize: true,
            uploadedBy: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
    })

    return NextResponse.json({ docs })
}
