import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"
import { prisma } from "@/lib/prisma"
import { findFolderByName, listFiles, downloadFile } from "@/lib/google-drive"
import { parseFileBuffer } from "@/lib/parsers"
import { embed } from "@/lib/ai-providers"

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const settings = await prisma.userSettings.findUnique({
            where: { userId: session.user.id },
            select: { geminiApiKey: true, currentWorkspaceId: true, driveFolderId: true }
        })

        if (!settings?.geminiApiKey) {
            return NextResponse.json({ error: "Gemini API key is required for embedding docs during sync." }, { status: 400 })
        }

        let folderId = settings.driveFolderId
        if (!folderId) {
            // Try to find default "PresaleX_KB" folder
            const folder = await findFolderByName("PresaleX_KB")
            if (folder) {
                folderId = folder.id as string
                // Save it for next time
                await prisma.userSettings.update({
                    where: { userId: session.user.id },
                    data: { driveFolderId: folderId }
                })
            } else {
                return NextResponse.json({ error: "No 'PresaleX_KB' folder found in your Google Drive." }, { status: 404 })
            }
        }

        // List files in folder
        const files = await listFiles(folderId)
        const existingDocs = await prisma.knowledgeDoc.findMany({
            where: { workspaceId: settings.currentWorkspaceId || undefined },
            select: { name: true }
        })
        const existingNames = new Set(existingDocs.map(d => d.name))

        const newFiles = files.filter(f => !existingNames.has(f.name as string))
        let syncedCount = 0

        for (const file of newFiles.slice(0, 5)) { // Limit to 5 per sync to avoid timeouts
            try {
                const buffer = await downloadFile(file.id as string)
                const content = await parseFileBuffer(buffer, file.name as string)

                if (content && content.length > 10) {
                    const embedding = await embed(content.substring(0, 5000), settings.geminiApiKey)
                    await prisma.knowledgeDoc.create({
                        data: {
                            name: file.name as string,
                            type: file.name?.split(".").pop() || "unknown",
                            content,
                            category: "drive_sync",
                            fileSize: file.size ? parseInt(file.size as string) : 0,
                            uploadedBy: session.user.id,
                            workspaceId: settings.currentWorkspaceId,
                            embedding
                        }
                    })
                    syncedCount++
                }
            } catch (e) {
                console.error(`Failed to sync file ${file.name}:`, e)
            }
        }

        return NextResponse.json({
            success: true,
            totalFound: files.length,
            newCount: newFiles.length,
            syncedThisOctet: syncedCount,
            message: syncedCount > 0 ? `Successfully synced ${syncedCount} new documents from Google Drive.` : "Everything is up to date."
        })

    } catch (error: any) {
        console.error("GDrive Sync Error:", error)
        return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 })
    }
}
