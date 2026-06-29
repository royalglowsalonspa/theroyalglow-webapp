import { DocsShell } from '@/components/docs-shell'
import { getVersion, pageExistsIn, versions } from '@/lib/source'
import { getCanonicalUrl, resolveVersion, robotsFor } from '@/lib/versions'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * Single optional catch-all docs route (design Version_Router). Latest
 * (`/docs/*`) and legacy (`/docs/v{N}/*`) both live under `/docs`, so version
 * dispatch happens in code via `resolveVersion(slug)` — a sibling `[version]`
 * segment is impossible next to an optional catch-all (Next.js forbids it).
 *
 * The route resolves the version, loads the page from that version's own
 * `source.getPage(rest)`, and renders the version-aware {@link DocsShell}. A
 * missing page or an unregistered `/v{N}` prefix → `notFound()`; the route NEVER
 * falls back to another version's content (Req 5.5, 6.4, 12.3).
 */

/**
 * The site origin used to build absolute canonical URLs (Req 9). Read from the
 * environment with a sensible production fallback for the docs subdomain.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://docs.theroyalglow.in'

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await props.params
  const result = resolveVersion(slug)

  // Unregistered /v{N} prefix → version-aware 404 (Req 6.3, 6.4).
  if (result.kind === 'unknownVersion') {
    notFound()
  }

  // Map the pure metadata result to its wired runtime version (defensive: the
  // runtime registry and the pure registry are kept in lockstep).
  const runtimeVersion = getVersion(result.version.id)
  if (runtimeVersion === undefined) {
    notFound()
  }

  // Load the page from THIS version's own source only — never fall back to
  // another version (Req 5.5, 12.3).
  const page = runtimeVersion.source.getPage(result.rest)
  if (!page) {
    notFound()
  }

  return <DocsShell page={page} rest={result.rest} version={runtimeVersion} />
}

/**
 * Union every present version's static params (Req 10.5): the latest version's
 * slugs as-is, plus each legacy version's pages prefixed with its `v{N}` segment
 * and the bare `['v{N}']` version landing param.
 */
export function generateStaticParams(): { slug?: string[] }[] {
  const params: { slug?: string[] }[] = []

  for (const version of versions) {
    const versionParams = version.source.generateParams()

    if (version.isLatest || version.versionNumber === null) {
      params.push(...versionParams)
      continue
    }

    const prefix = `v${version.versionNumber}`
    // The version landing page (`/docs/v{N}`).
    params.push({ slug: [prefix] })
    // Every page of the legacy version, prefixed with its version segment.
    for (const param of versionParams) {
      params.push({ slug: [prefix, ...(param.slug ?? [])] })
    }
  }

  return params
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await props.params
  const result = resolveVersion(slug)

  if (result.kind === 'unknownVersion') {
    notFound()
  }

  const runtimeVersion = getVersion(result.version.id)
  if (runtimeVersion === undefined) {
    notFound()
  }

  const page = runtimeVersion.source.getPage(result.rest)
  if (!page) {
    notFound()
  }

  const latestRuntime = getVersion('latest')
  if (latestRuntime === undefined) {
    notFound()
  }

  const canonical = getCanonicalUrl(runtimeVersion, result.rest, {
    siteUrl: SITE_URL,
    latest: latestRuntime,
    equivalentExistsInLatest: (relSlug) => pageExistsIn(latestRuntime, relSlug),
  })
  const robots = robotsFor(runtimeVersion, result.rest)

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical },
    robots: { index: robots.index, follow: robots.follow },
  }
}
