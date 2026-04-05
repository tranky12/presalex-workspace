import type { Metadata } from "next"
import { Inter, Playfair_Display } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/../auth"
import WorkspaceLayout from "@/components/WorkspaceLayout"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })

export const metadata: Metadata = {
  title: "PresaleX — SC&L Expert Workspace",
  description: "Professional presale solution support workspace for Supply Chain & Logistics teams",
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<Record<string, string>>
}) {
  const _params = await params
  const session = await auth()
  const isPublicPage = !session?.user

  return (
    <html lang="vi" className={`${inter.variable} ${playfair.variable}`}>
      <body className="bg-[#060c1a] text-white antialiased">
        <SessionProvider session={session}>
          {isPublicPage ? (
            children
          ) : (
            <WorkspaceLayout>{children}</WorkspaceLayout>
          )}
        </SessionProvider>
      </body>
    </html>
  )
}
