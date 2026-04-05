let pdfParse: any = null
let mammoth: any = null

async function loadParsers() {
    if (!pdfParse) {
        const pdfModule = await import("pdf-parse")
        pdfParse = (pdfModule as any).default || pdfModule
    }
    if (!mammoth) {
        mammoth = await import("mammoth")
    }
}

export async function parseFileBuffer(buffer: Buffer, filename: string): Promise<string> {
    await loadParsers()
    const ext = filename.split(".").pop()?.toLowerCase() || ""

    try {
        if (ext === "pdf") {
            const parsed = await pdfParse(buffer)
            return parsed.text
        } else if (["docx", "doc"].includes(ext)) {
            const result = await mammoth.extractRawText({ buffer })
            return result.value
        } else if (["pptx", "ppt"].includes(ext)) {
            return `[PPTX File: ${filename}]\nContent extraction in progress.`
        } else if (["txt", "md"].includes(ext)) {
            return buffer.toString("utf-8")
        }
    } catch (e) {
        console.error(`Error parsing ${filename}:`, e)
    }
    return ""
}
