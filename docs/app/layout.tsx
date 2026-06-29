import './global.css'
import { fontVariables } from '@/lib/fonts'
import { Banner } from 'fumadocs-ui/components/banner'
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={fontVariables} lang="en" suppressHydrationWarning>
      <body>
        <Banner id="rgss-docs-2026" variant="rainbow">
          Royal Glow internal docs · now fully interactive — Steps, API tables, file trees &amp;
          live status
        </Banner>
        {/* Search dialog (Ctrl/Cmd K) is enabled. The default Fumadocs client
            queries `/api/search`, which is implemented in task 9.1; until that
            endpoint lands the dialog opens and degrades gracefully (queries
            return no results / a transient error) without breaking the build or
            runtime. */}
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
