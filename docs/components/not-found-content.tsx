'use client'

import { useSearchContext } from 'fumadocs-ui/contexts/search'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { classifyNotFoundContext } from '@/lib/versions'

/**
 * Derive the request slug *below* the docs root (`/docs`) from a pathname.
 *
 * `app/not-found.tsx` does not receive the matched route params, so the missing
 * path is recovered client-side from {@link usePathname}. The leading `docs`
 * segment is stripped so the remaining segments line up with what
 * `classifyNotFoundContext` expects (e.g. `['v2', 'missing']`). When the path is
 * not under `/docs` at all, `undefined` is returned so the classifier reports
 * the generic latest context.
 *
 * @param pathname the current pathname from `usePathname()`.
 * @returns the segments below `/docs`, or `undefined` when not under `/docs`.
 */
function slugBelowDocs(pathname: string): string[] | undefined {
  const segments = pathname.split('/').filter((segment) => segment.length > 0)
  if (segments[0] !== 'docs') {
    return undefined
  }
  return segments.slice(1)
}

/** The themed heading + explanatory copy for a not-found request. */
type NotFoundMessage = { title: string; description: string }

/**
 * Map the path-derived not-found context to the heading + copy the
 * Not_Found_Page should present (Req 15.4).
 *
 * - latest context → generic "page not found".
 * - `version-not-found` → states the requested `/v{N}` version does not exist.
 * - `page-not-found-in-version` → states the page is missing in the (existing)
 *   version, naming its label.
 */
function messageFor(pathname: string): NotFoundMessage {
  const context = classifyNotFoundContext(slugBelowDocs(pathname))

  if (context === 'latest') {
    return {
      title: 'Page not found',
      description:
        'The page you are looking for does not exist or may have moved. Try searching the docs or head back to the latest documentation.',
    }
  }

  if (context.kind === 'version-not-found') {
    return {
      title: 'Documentation version not found',
      description: `The documentation version /v${context.requested} was not found. It may never have been published. Browse the latest documentation instead.`,
    }
  }

  return {
    title: `Page not found in ${context.version.label}`,
    description: `This page does not exist in the ${context.version.label} documentation. It may have been added in a newer version — try the latest documentation or search below.`,
  }
}

/**
 * Not_Found_Page content — a themed, version-aware 404 body (Req 15.1–15.4).
 *
 * Rendered as a small client island because the missing path must be recovered
 * from {@link usePathname} (the App Router `not-found.tsx` boundary receives no
 * route params). It is mounted inside the root `RootProvider`, so the
 * fumadocs search context is available and the page is styled with the
 * Theme_System Design_Tokens (`fd-*` token classes) for AA contrast in both
 * themes (Req 15.1, 15.5).
 *
 * Affordances:
 *   - a link to the Latest_Version documentation root `/docs` (Req 15.2);
 *   - a button that opens the search dialog plus a visible `Ctrl/Cmd K` hint,
 *     exposing the search control so the Reader can find the intended page
 *     (Req 15.3). When search is unavailable the button is omitted and the
 *     `/docs` link remains the recovery path.
 *
 * The global focus-ring and `prefers-reduced-motion` rules in `app/global.css`
 * provide keyboard focus visibility and reduced-motion compliance.
 */
export function NotFoundContent() {
  const pathname = usePathname()
  const { title, description } = messageFor(pathname)
  const search = useSearchContext()

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center text-fd-foreground">
      <p className="m-0 font-mono font-semibold text-fd-muted-foreground text-sm tracking-widest">
        404
      </p>
      <h1 className="m-0 font-semibold text-3xl text-fd-foreground sm:text-4xl">{title}</h1>
      <p className="m-0 max-w-prose text-fd-muted-foreground text-base leading-relaxed">
        {description}
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Link
          className="inline-flex items-center justify-center rounded-full bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground text-sm transition-colors hover:opacity-90"
          href="/docs"
        >
          Go to the latest documentation
        </Link>
        {search.enabled ? (
          <button
            className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-secondary px-5 py-2.5 font-medium text-fd-secondary-foreground text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            onClick={() => search.setOpenSearch(true)}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" x2="16.65" y1="21" y2="16.65" />
            </svg>
            Search the docs
            <kbd className="rounded border border-fd-border bg-fd-background px-1.5 py-0.5 font-mono text-fd-muted-foreground text-xs">
              Ctrl K
            </kbd>
          </button>
        ) : null}
      </div>
    </main>
  )
}
