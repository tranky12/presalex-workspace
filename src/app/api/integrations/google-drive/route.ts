import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"

// GET /api/integrations/google-drive/list — list files in configured Drive folder
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userSettings = await prisma.userSettings.findUnique({
        where: { userId: session.user.id! },
        select: { driveFolderId: true },
    })

    if (!userSettings?.driveFolderId) {
        return NextResponse.json({ error: "Google Drive folder not configured. Go to Settings → Integrations." }, { status: 400 })
    }

    // Get user's Google access token from their OAuth account
    const account = await prisma.account.findFirst({
        where: { userId: session.user.id!, provider: "google" },
    })

    if (!account?.access_token) {
        return NextResponse.json({ error: "Google Drive requires re-login with Drive scope. Please sign out and sign in again." }, { status: 401 })
    }

    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${userSettings.driveFolderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=50`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
    )

    if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: `Drive API error: ${err.error?.message || res.statusText}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ files: data.files || [] })
}

// POST /api/integrations/google-drive/import — import a Drive file into knowledge base
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { fileId, fileName, mimeType } = await req.json()

    // Get user's Google access token
    const account = await prisma.account.findFirst({
        where: { userId: session.user.id!, provider: "google" },
    })

    if (!account?.access_token) {
        return NextResponse.json({ error: "Google access token not available." }, { status: 401 })
    }

    // Export Google Docs to plain text, download other files
    let downloadUrl: string
    let contentType = "text/plain"

    if (mimeType === "application/vnd.google-apps.document") {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
    } else if (mimeType === "application/vnd.google-apps.presentation") {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
    } else {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
        contentType = mimeType
    }

    const fileRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${account.access_token}` },
    })

    if (!fileRes.ok) {
        return NextResponse.json({ error: `Failed to download file from Drive: ${fileRes.statusText}` }, { status: 500 })
    }

    const content = await fileRes.text()

    // Save to knowledge base
    const doc = await prisma.knowledgeDoc.create({
        data: {
            name: fileName,
            type: mimeType.includes("pdf") ? "pdf" : mimeType.includes("presentation") ? "pptx" : "text",
            content: content.substring(0, 50000),
            category: "general",
            tags: ["google-drive"],
            fileSize: content.length,
            fileUrl: `https://drive.google.com/file/d/${fileId}`,
            uploadedBy: session.user.id,
            embedding: [],
        },
    })

    return NextResponse.json({
        success: true,
        id: doc.id,
        name: doc.name,
        message: `✅ "${fileName}" imported from Google Drive (${content.length.toLocaleString()} chars)`,
    })
}
