'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Per-content-page reader affordances (Page_Affordances, Requirement 14):
 * a "last updated" indicator, a Copy-Markdown control with visible
 * confirmation / failure indication, an "Open" link to the page source, and a
 * "Report an issue" link to the page's GitHub source/edit URL.
 *
 * This is a `'use client'` component because the Copy-Markdown control needs
 * the clipboard API and local confirmation state. The "Was this page helpful?"
 * Feedback_Control is a SEPARATE component (`components/feedback.tsx`,
 * task 7.4); to avoid coupling, this component does not import it. The parent
 * shell (task 8.1) passes the rendered control through the `feedbackSlot` prop.
 *
 * Backs:
 *   - Req 14.1 — last-updated indicator, formatted `DD/MM/YYYY` (`en-IN`).
 *   - Req 14.2 — copy/open the page's Markdown source.
 *   - Req 14.3 — copy to clipboard + visible confirmation; on failure a visible
 *     failure indication, leaving the content unchanged.
 *   - Req 14.4 — report-an-issue link to the page's source.
 *   - Req 14.7 — keyboard operable, AA contrast/focus, reduced-motion safe.
 */
export type PageAffordancesProps = {
  /**
   * The page's last-modified timestamp (git last-modified, frontmatter
   * fallback). `null`/`undefined`/unparseable → the indicator is omitted
   * gracefully (Req 14.1).
   */
  lastModified?: string | Date | null
  /** The page's raw MDX source, copied to the clipboard by Copy-Markdown. */
  markdownSource: string
  /**
   * The page's GitHub source/edit URL. Used both by the "Open" link (view the
   * source) and the "Report an issue" link (Req 14.2, 14.4).
   */
  sourceUrl: string
  /**
   * Optional slot the parent shell (task 8.1) fills with the `<Feedback/>`
   * control (task 7.4). Kept as a slot — rather than a hard import — so this
   * component does not depend on `feedback.tsx` while both are built
   * concurrently.
   */
  feedbackSlot?: ReactNode
}

/** Transient state of the Copy-Markdown control. */
type CopyStatus = 'idle' | 'copied' | 'error'

/** How long (ms) the copy confirmation / failure indication stays visible. */
const COPY_FEEDBACK_TIMEOUT_MS = 2000

/**
 * `DD/MM/YYYY` formatter using the India locale (`en-IN`), matching the
 * project's date-display convention.
 */
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * Format a last-modified value for display (pure). Returns the `DD/MM/YYYY`
 * label and an ISO string for the `<time dateTime>` attribute, or `null` when
 * the value is absent or unparseable (so the indicator is omitted gracefully).
 */
function formatLastModified(
  value: string | Date | null | undefined,
): { label: string; iso: string } | null {
  if (value === null || value === undefined) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return { label: dateFormatter.format(date), iso: date.toISOString() }
}

/** Inline copy icon (no external icon dependency). */
function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

/** Inline external-link icon (no external icon dependency). */
function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" x2="21" y1="14" y2="3" />
    </svg>
  )
}

/** Shared class for the affordance row's link/button controls. */
const controlClassName =
  'inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-card px-2.5 py-1.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground'

export function PageAffordances({
  lastModified,
  markdownSource,
  sourceUrl,
  feedbackSlot,
}: PageAffordancesProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updated = formatLastModified(lastModified)

  const handleCopy = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(markdownSource)
      setCopyStatus('copied')
    } catch {
      // Failure indication only — the page content is never mutated (Req 14.3).
      setCopyStatus('error')
    }
  }, [markdownSource])

  // Auto-clear the confirmation / failure indication after a short delay.
  useEffect(() => {
    if (copyStatus === 'idle') {
      return
    }
    timerRef.current = setTimeout(() => {
      setCopyStatus('idle')
    }, COPY_FEEDBACK_TIMEOUT_MS)
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [copyStatus])

  const copyLabel =
    copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy Markdown'

  return (
    <section
      aria-label="Page tools"
      className="mt-10 flex flex-col gap-4 border-t border-fd-border pt-6"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {updated ? (
          <p className="text-sm text-fd-muted-foreground">
            Last updated on{' '}
            <time className="font-medium text-fd-foreground" dateTime={updated.iso}>
              {updated.label}
            </time>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button
            className={controlClassName}
            data-allow-motion="opacity"
            onClick={handleCopy}
            type="button"
          >
            <CopyIcon />
            {copyLabel}
          </button>

          <a
            className={controlClassName}
            href={sourceUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <ExternalLinkIcon />
            Open
          </a>

          <a
            className={controlClassName}
            href={sourceUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <ExternalLinkIcon />
            Report an issue
          </a>
        </div>
      </div>

      {/* Visible + announced copy confirmation / failure indication (Req 14.3).
          `<output>` carries an implicit `role="status"` / polite live region. */}
      <output
        aria-live="polite"
        className={
          copyStatus === 'error'
            ? 'text-sm font-medium text-fd-primary'
            : 'text-sm font-medium text-fd-muted-foreground'
        }
      >
        {copyStatus === 'copied'
          ? 'Markdown copied to clipboard.'
          : copyStatus === 'error'
            ? 'Could not copy to clipboard. The page content is unchanged.'
            : ''}
      </output>

      {feedbackSlot ? <div>{feedbackSlot}</div> : null}
    </section>
  )
}

export default PageAffordances
