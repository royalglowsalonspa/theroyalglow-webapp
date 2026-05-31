import './global.css'
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Search is disabled for now (server search route is a follow-up; see
            api-reference.mdx note). The docs render and navigate fully without it. */}
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  )
}
