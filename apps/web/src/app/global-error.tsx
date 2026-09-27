'use client'

/************************************************************
 * Module Name  : GlobalError
 * Scope        : Application Shell / Error Boundary
 *
 * Description  : Last-resort error UI. Next.js renders it in place of the root
 *                layout when the layout itself (or anything outside a nested
 *                error boundary) throws, so it owns its own <html> and <body>.
 *
 * Notes        :
 * - Deliberately dependency-light: no header, footer, analytics, or CMS data,
 *   since any of those may be what failed. Brand fonts are not re-linked here;
 *   the theme's system-font fallbacks keep the page legible.
 * - error.digest is a server-generated hash (never the message), shown so a
 *   customer can quote it and it can be matched against server logs.
 * - Reports to Sentry only when a DSN was configured at build time, loading
 *   the SDK lazily to match src/instrumentation-client.ts.
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
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
    void import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.captureException(error)
      })
      .catch(() => undefined)
  }, [error])

  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body
        className="bg-warm-cream font-sans text-cocoa-dark antialiased"
        suppressHydrationWarning
      >
        <title>Something went wrong | Royal Glow Salon &amp; Spa</title>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
          <p className="font-ui text-xs font-semibold uppercase tracking-[0.2em] text-gold-ink">
            Royal Glow Salon &amp; Spa
          </p>
          <h1 className="font-display text-3xl leading-tight font-extrabold sm:text-4xl">
            Something went wrong
          </h1>
          <p className="text-base leading-relaxed text-warm-gray">
            We couldn&apos;t load this page. Please try again, or head back to the homepage.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button className="h-11 px-6" onClick={() => retry()} type="button" variant="gold">
              Try again
            </Button>
            {/* A plain anchor, not next/link: a full document load rebuilds the
                root layout from scratch instead of reusing the broken tree. */}
            <Button asChild className="h-11 px-6" variant="outline">
              <a href="/">Go to homepage</a>
            </Button>
          </div>
          {error.digest ? (
            <p className="font-ui text-xs text-warm-gray">
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
