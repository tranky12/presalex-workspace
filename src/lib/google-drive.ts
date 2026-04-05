import { google } from "googleapis"
import { auth as nextAuth } from "@/../../auth"

export async function getGoogleDriveClient() {
    const session = await nextAuth()
    if (!session?.accessToken) {
        throw new Error("No Google access token found. Please sign in again.")
    }

    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: session.accessToken as string })

    return google.drive({ version: "v3", auth })
}

export async function listFiles(folderId: string) {
    const drive = await getGoogleDriveClient()
    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, size, modifiedTime)",
    })
    return res.data.files || []
}

export async function downloadFile(fileId: string) {
    const drive = await getGoogleDriveClient()
    const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
    )
    return Buffer.from(res.data as ArrayBuffer)
}

export async function findFolderByName(name: string) {
    const drive = await getGoogleDriveClient()
    const res = await drive.files.list({
        q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name)",
    })
    return res.data.files?.[0]
}
