import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/../auth"

// POST /api/export/pptx — generate branded PPTX from proposal data
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { title, company, slides, tone = "executive" } = await req.json()

        // Dynamic import of pptxgenjs (server-only)
        const PptxGenJS = (await import("pptxgenjs")).default
        const pptx = new PptxGenJS()

        // Branding
        pptx.title = title || "Presale Proposal"
        pptx.subject = "SC&L Solution Proposal"
        pptx.author = "PresaleX"
        pptx.company = "Smartlog"

        // Layout
        pptx.layout = "LAYOUT_WIDE" // 16:9

        // Color palette based on tone
        const ACCENT = "#00D4AA"
        const DARK = "#060C1A"
        const LIGHT = "#FFFFFF"

        // ─── Master slide template colors ────────────────────
        const makeSlide = (slideNum: number, slideData: { title?: string; content?: string; tag?: string; speakerNotes?: string }) => {
            const slide = pptx.addSlide()

            // Dark background
            slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: DARK } })

            // Accent bar left
            slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.08, h: "100%", fill: { color: ACCENT } })

            // Slide number
            slide.addText(String(slideNum), {
                x: 12.2, y: 6.8, w: 0.5, h: 0.3,
                fontSize: 8, color: "555555", align: "right",
            })

            // Tag / section label
            if (slideData.tag) {
                slide.addText(slideData.tag.toUpperCase(), {
                    x: 0.3, y: 0.15, w: 3, h: 0.25,
                    fontSize: 8, color: ACCENT, bold: true, charSpacing: 4,
                })
            }

            // Title
            if (slideData.title) {
                slide.addText(slideData.title, {
                    x: 0.3, y: 0.55, w: 12.4, h: 0.9,
                    fontSize: 28, color: LIGHT, bold: true, fontFace: "Calibri",
                    breakLine: false,
                })
            }

            // Content
            if (slideData.content) {
                const lines = slideData.content.split("\n").map(line => {
                    const isBullet = line.startsWith("- ") || line.startsWith("• ")
                    return {
                        text: isBullet ? line.replace(/^[-•]\s/, "") : line,
                        options: {
                            bullet: isBullet ? { indent: 15 } : false,
                            fontSize: 14,
                            color: isBullet ? "CCDDEE" : LIGHT,
                            paraSpaceBefore: 6,
                            bold: line.startsWith("**") && line.endsWith("**"),
                        },
                    }
                }).filter(l => l.text.trim())

                if (lines.length > 0) {
                    slide.addText(lines, {
                        x: 0.3, y: 1.6, w: 12.2, h: 4.8,
                        valign: "top", fontFace: "Calibri",
                    })
                }
            }

            // Speaker notes
            if (slideData.speakerNotes) {
                slide.addNotes(slideData.speakerNotes)
            }

            // Footer: company name
            slide.addText("SMARTLOG · CONFIDENTIAL", {
                x: 0.3, y: 6.85, w: 6, h: 0.2,
                fontSize: 7, color: "444444", italic: true,
            })
        }

        // Title slide
        const titleSlide = pptx.addSlide()
        titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: DARK } })
        titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: "100%", fill: { color: ACCENT } })
        titleSlide.addShape(pptx.ShapeType.rect, { x: 0.12, y: 3.2, w: 12.76, h: 0.04, fill: { color: ACCENT } })
        titleSlide.addText("⟡ PRESALEX", { x: 0.3, y: 0.4, w: 5, h: 0.4, fontSize: 11, color: ACCENT, bold: true, charSpacing: 6 })
        titleSlide.addText(title || "Supply Chain Solution Proposal", {
            x: 0.3, y: 1.2, w: 12, h: 1.8, fontSize: 40, color: LIGHT, bold: true, fontFace: "Calibri", breakLine: false,
        })
        titleSlide.addText(`Prepared for: ${company || "Client"}`, {
            x: 0.3, y: 3.4, w: 8, h: 0.5, fontSize: 16, color: "AABBCC", fontFace: "Calibri",
        })
        titleSlide.addText([
            { text: "April 2026  ", options: { color: "888888", fontSize: 11 } },
            { text: "CONFIDENTIAL", options: { color: ACCENT, fontSize: 11, bold: true } },
        ], { x: 0.3, y: 4.1, w: 6, h: 0.3 })
        titleSlide.addText("SMARTLOG", { x: 10, y: 6.7, w: 3, h: 0.3, fontSize: 9, color: "555555", align: "right" })

        // Content slides
        const contentSlides = slides || [
            { title: "Executive Summary", content: "- Key opportunity identified\n- Proposed solution overview\n- Expected business impact", tag: "OVERVIEW" },
            { title: "Client Situation", content: "- Current state analysis\n- Key pain points identified\n- Cost of inaction", tag: "SITUATION" },
            { title: "Proposed Solution", content: "- Solution architecture\n- Key capabilities\n- Implementation approach", tag: "SOLUTION" },
            { title: "Business Case & ROI", content: "- Investment summary\n- Expected returns\n- Payback period", tag: "BUSINESS CASE" },
            { title: "Next Steps", content: "- Proof of concept\n- Timeline to decision\n- Team introduction", tag: "ACTION" },
        ]

        contentSlides.forEach((s: { title?: string; content?: string; tag?: string; speakerNotes?: string }, i: number) => {
            makeSlide(i + 2, s)
        })

        // Generate buffer
        const buffer = await pptx.write({ outputType: "arraybuffer" }) as ArrayBuffer

        return new NextResponse(Buffer.from(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "Content-Disposition": `attachment; filename="PresaleX-${(company || "proposal").replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pptx"`,
            },
        })
    } catch (error) {
        console.error("PPTX export error:", error)
        return NextResponse.json({ error: "Failed to generate PPTX" }, { status: 500 })
    }
}
