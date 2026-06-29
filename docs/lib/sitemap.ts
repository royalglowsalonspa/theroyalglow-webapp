/**
 * Pure sitemap generation for the Docs_Site (Property 14; Req 9.5).
 *
 * `buildSitemap` enumerates every published page across all documentation
 * versions exactly once as absolute URLs. It backs the design's
 * `app/sitemap.ts` route, which gathers each version's page slugs from its
 * fumadocs loader (I/O) and hands them to this function as plain data.
 *
 * ## Purity / no I/O
 *
 * This module touches no clipboard, network, filesystem, fumadocs loader, or
 * `@/.source` generated content. Listing a version's pages requires the loader,
 * so the page slugs are **injected** per version (`relSlugs`) — keeping this
 * function pure, edge-compatible (Cloudflare), and directly unit/PBT testable.
 */

/** A single version's contribution to the sitemap: its base path and pages. */
export type SitemapVersionInput = {
  /** URL base path for the version: `'/docs'` for latest, `'/docs/v{N}'` legacy. */
  basePath: string
  /**
   * Every published page's slug relative to `basePath`. An empty inner array
   * (`[]`) denotes the version's landing page (the bare `basePath`).
   */
  relSlugs: string[][]
}

/** Input to {@link buildSitemap}: the site origin plus every version's pages. */
export type BuildSitemapInput = {
  /** The site origin, e.g. `'https://docs.theroyalglow.in'` (no trailing path). */
  siteUrl: string
  /** Each registered version with its published page slugs. */
  versions: SitemapVersionInput[]
}

/**
 * Strip a single trailing slash from a site origin so joining with a path that
 * starts with `/` never produces a double slash.
 */
function trimTrailingSlash(siteUrl: string): string {
  return siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl
}

/**
 * Join a version `basePath` with a relative slug into a URL path.
 *
 * An empty `relSlug` yields the version landing page (the bare `basePath`);
 * otherwise the segments are appended under it.
 */
function joinDocsPath(basePath: string, relSlug: string[]): string {
  if (relSlug.length === 0) {
    return basePath
  }
  return `${basePath}/${relSlug.join('/')}`
}

/**
 * Build the sitemap URL set (pure; Property 14; Req 9.5).
 *
 * Returns the union of every published page across all versions as absolute
 * `https` URLs (`siteUrl` + version `basePath` + relative slug). An empty
 * relative slug yields the version's landing page. The result is **exact and
 * duplicate-free**: each distinct URL appears once, in first-seen order.
 *
 * @param input the site origin and every version's published page slugs.
 * @returns the de-duplicated, ordered list of absolute page URLs.
 */
export function buildSitemap(input: BuildSitemapInput): string[] {
  const origin = trimTrailingSlash(input.siteUrl)
  const seen = new Set<string>()
  const urls: string[] = []

  for (const version of input.versions) {
    for (const relSlug of version.relSlugs) {
      const url = `${origin}${joinDocsPath(version.basePath, relSlug)}`
      if (!seen.has(url)) {
        seen.add(url)
        urls.push(url)
      }
    }
  }

  return urls
}
