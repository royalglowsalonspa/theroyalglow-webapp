'use client'

/************************************************************
 * Module Name  : GlobalError (admin)
 * Scope        : Application Shell / Error Boundary
 *
 * Description  : Last-resort error UI. Next.js renders it in place of the root
 *                layout when the layout itself (session lookup, AdminShell)
 *                throws, so it owns its own <html> and <body> and renders no
 *                sidebar or top bar.
 *
 * Notes        :
 * - error.digest is a server-generated hash (never the message), shown so
 *   staff can quote it and it can be matched against server logs.
 * - Reports to the admin Sentry project only when its DSN was set at build
 *   time, loading the SDK lazily to match src/instrumentation-client.ts.
 * - The retry action re-renders the tree; the dashboard link is a plain anchor
 *   so a full document load rebuilds the root layout from scratch.
 ************************************************************/

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import '@/styles/globals.css'

type GlobalErrorProps = {
  error: Error & { digest?: string }
  retry: () => void
}

export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_ADMIN_SENTRY_DSN) return
    void import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.captureException(error)
      })
      .catch(() => undefined)
  }, [error])

  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body
        className="bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <title>Something went wrong | Royal Glow Admin</title>
        <meta content="noindex, nofollow" name="robots" />
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 py-16 text-center">
          <p className="font-ui text-xs font-semibold uppercase tracking-[0.2em] text-gold-ink">
            Royal Glow Admin
          </p>
          <h1 className="font-display text-2xl leading-tight font-extrabold sm:text-3xl">
            Something went wrong
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This page failed to load. Try again, or go back to the dashboard. If it keeps happening,
            send the reference below to the developer.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button className="h-10 px-5" onClick={() => retry()} type="button">
              Try again
            </Button>
            <Button asChild className="h-10 px-5" variant="outline">
              <a href="/">Back to dashboard</a>
            </Button>
          </div>
          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
