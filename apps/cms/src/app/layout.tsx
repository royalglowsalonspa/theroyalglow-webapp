import type { ReactNode } from 'react'

// This CMS app only hosts the Payload admin. Payload's own (payload)/layout.tsx
// renders the full <html>/<body> document, so the root layout must NOT render
// its own — otherwise the document is nested (<html> inside <body>), which
// triggers hydration errors. Pass children straight through.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
