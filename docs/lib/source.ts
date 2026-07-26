import { loader } from 'fumadocs-core/source'
import { docs, docsV2 } from '@/.source/server'
import type { DocVersion } from '@/lib/versions'
import { versionsMeta } from '@/lib/versions'

/**
 * Runtime content-source binding for the Docs_Site Version_Router.
 *
 * `lib/versions.ts` stays **pure** (version metadata + pure resolution logic, no
 * loader/`@/.source` import). This module layers the real fumadocs loader
 * `source` instances on top of that metadata: one `loader` per version, then an
 * ordered {@link versions} registry that attaches each loader source to its
 * `versionsMeta` entry by `id`. Routes, components, the sitemap, and search
 * consume `versions`/`getVersion`/`pageExistsIn` from here.
 */

/** Latest_Version source — unchanged `baseUrl: '/docs'` (preserves every existing URL). */
export const latestSource = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
})

/** Legacy v2 source — served under `/docs/v2`, loaded from its own collection. */
export const v2Source = loader({
  baseUrl: '/docs/v2',
  source: docsV2.toFumadocsSource(),
})

/**
 * Backward-compatible alias for the Latest_Version source. Existing imports of
 * `@/lib/source` (`app/docs/layout.tsx`, `app/docs/[[...slug]]/page.tsx`)
 * continue to work unchanged.
 */
export const source = latestSource

/** The concrete fumadocs loader source type shared by every version. */
export type DocsSource = typeof latestSource

/** A fully-wired runtime version: metadata + its bound loader source. */
export type DocVersionRuntime = DocVersion<DocsSource>

/** Map of version id → its bound loader source, used to build {@link versions}. */
const sourcesById = new Map<string, DocsSource>([
  ['latest', latestSource],
  ['v2', v2Source],
])

/**
 * The ordered runtime version registry (most-recent-first), built by attaching
 * each loader source to its pure `versionsMeta` entry by `id`. Order is
 * inherited from `versionsMeta` ([latest, v2]); display ordering for the
 * Version_Switcher is handled separately by `getSwitcherOrder`.
 *
 * @throws if a registered `versionsMeta` entry has no bound loader source — a
 * construction invariant (a version was registered without wiring its source).
 */
export const versions: DocVersionRuntime[] = versionsMeta.map((meta) => {
  const versionSource = sourcesById.get(meta.id)
  if (versionSource === undefined) {
    throw new Error(`No loader source bound for documentation version '${meta.id}'`)
  }
  return { ...meta, source: versionSource }
})

/** Look up a runtime version by its id (`'latest'`, `'v2'`, …). */
export function getVersion(id: string): DocVersionRuntime | undefined {
  return versions.find((version) => version.id === id)
}

/**
 * Does a page exist in `version` at the given relative slug? Backs the
 * cross-version equivalence checks (`equivalentPath`, `getCanonicalUrl`) by
 * supplying the loader-backed existence predicate those pure functions inject.
 */
export function pageExistsIn(version: DocVersionRuntime, relSlug: string[]): boolean {
  return version.source.getPage(relSlug) !== undefined
}
