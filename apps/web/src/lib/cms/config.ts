import { createLogger } from '@rgss/logger'

// Thin, guarded seam between the web app and the Payload CMS REST API.
//
// We read `CMS_URL` straight from `process.env` (NOT from `@/env`) on purpose:
// `env.ts` validates its schema at build time and would fail when the CMS is
// not yet provisioned, but this layer must degrade gracefully — the web app
// has to build, typecheck, lint, and serve `/blog` and `/gallery` with NO CMS
// keys present, rendering an empty state instead of breaking. Every export here
// is total: it resolves to a safe value (`null`) and logs anomalies; it never
// throws into a page render or the sitemap.

const logger = createLogger({
  service: 'web:cms',
  environment: process.env.NODE_ENV ?? 'development',
})

/** Default ISR window for CMS reads (seconds). */
export const CMS_REVALIDATE_SECONDS = 3600

/** Strip a single trailing slash so `${base}${path}` never doubles up. */
function normaliseBase(raw: string): string {
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

/** True only when `CMS_URL` is a non-empty string that parses as a URL. */
export function isCmsConfigured(): boolean {
  const raw = process.env.CMS_URL
  if (typeof raw !== 'string' || raw.trim() === '') {
    return false
  }
  try {
    // Throws on an invalid URL; we only care that it parses.
    new URL(raw)
    return true
  } catch {
    return false
  }
}

/** Base URL for the Payload REST API (trailing slash stripped), or null. */
export function cmsBaseUrl(): string | null {
  if (!isCmsConfigured()) {
    return null
  }
  // `isCmsConfigured` guarantees a non-empty string here.
  const raw = process.env.CMS_URL as string
  return normaliseBase(raw.trim())
}

/**
 * Guarded fetch against the Payload REST API.
 * - Returns null when the CMS is not configured.
 * - Returns null (never throws) on network error, non-2xx, or parse failure.
 * - Applies `next: { revalidate }` (default `CMS_REVALIDATE_SECONDS`) for ISR.
 *
 * `path` is expected to begin with `/api/...` (relative to the CMS base URL).
 */
export async function cmsFetch<T>(
  path: string,
  init?: { revalidate?: number },
): Promise<T | null> {
  const base = cmsBaseUrl()
  if (base === null) {
    return null
  }

  const url = `${base}${path}`
  const revalidate = init?.revalidate ?? CMS_REVALIDATE_SECONDS

  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      next: { revalidate },
    })

    if (!res.ok) {
      logger.warn('cms fetch returned non-2xx', {
        path,
        status: res.status,
      })
      return null
    }

    const json = (await res.json()) as T
    return json
  } catch (error) {
    logger.warn('cms fetch failed', {
      path,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
