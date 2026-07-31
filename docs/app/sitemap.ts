import type { MetadataRoute } from 'next'
import { buildSitemap } from '@/lib/sitemap'
import { versions } from '@/lib/source'

/**
 * Sitemap for the Docs_Site (Req 9.5).
 *
 * Enumerates every published page across every documentation version
 * (Latest_Version `/docs` plus each Legacy_Version `/docs/v{N}`) exactly once as
 * an absolute URL. The pure `buildSitemap` does the URL assembly and
 * de-duplication; this route performs the I/O (reading each version's pages from
 * its fumadocs loader) and adapts the result to `MetadataRoute.Sitemap`.
 *
 * ## Site origin
 *
 * Resolved from `NEXT_PUBLIC_DOCS_URL`, then `NEXT_PUBLIC_APP_URL`, falling back
 * to the production docs origin. Kept identical to `app/robots.ts` so the
 * sitemap URLs and the canonical/robots origins always agree. The
 * `NEXT_PUBLIC_*` vars are inlined at build time, so this works on any runtime.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_DOCS_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://docs.theroyalglow.in'

/**
 * Derive a version's published-page relative slugs from its fumadocs loader.
 *
 * Each `page.slugs` is the page's slug relative to the version's `basePath`
 * (an empty array denotes the version landing page). Feeding these to
 * `buildSitemap` with the same `basePath` reconstructs exactly each page's
 * `page.url`, so the sitemap and the live routes always agree.
 */
function relSlugsFor(version: (typeof versions)[number]): string[][] {
  return version.source.getPages().map((page) => page.slugs)
}

/**
 * The App Router sitemap: one entry per published page per version, absolute
 * URLs, no duplicates.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const urls = buildSitemap({
    siteUrl,
    versions: versions.map((version) => ({
      basePath: version.basePath,
      relSlugs: relSlugsFor(version),
    })),
  })

  return urls.map((url) => ({ url }))
}
