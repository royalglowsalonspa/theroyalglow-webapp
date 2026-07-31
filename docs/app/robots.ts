import type { MetadataRoute } from 'next'

/**
 * Robots policy for the Docs_Site (Req 9.6, 9.7).
 *
 * Every documentation page — latest and every legacy `/v{N}` — is
 * `index: true, follow: true`. Search-ranking is steered toward the
 * Latest_Version via the per-page canonical link (see `getCanonicalUrl` in
 * `lib/versions.ts`), NOT by disallowing or noindexing legacy pages. So this
 * policy allows indexing and following for all user agents and references the
 * sitemap, mirroring `robotsFor`, which returns `{ index: true, follow: true }`
 * for every version/page.
 *
 * ## Site origin
 *
 * Resolved from `NEXT_PUBLIC_DOCS_URL`, then `NEXT_PUBLIC_APP_URL`, falling back
 * to the production docs origin. Kept identical to `app/sitemap.ts` (task 9.2)
 * so the referenced sitemap URL and canonical origins always agree. The
 * `NEXT_PUBLIC_*` vars are inlined at build time, so this works on any runtime.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_DOCS_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://docs.theroyalglow.in'

/** Strip a single trailing slash so the joined sitemap URL has no double slash. */
function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/**
 * The App Router robots policy: allow indexing and following for all user
 * agents and point crawlers at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = trimTrailingSlash(siteUrl)

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
