/**
 * Version registry and pure path/version resolution for the Docs_Site
 * Version_Router.
 *
 * This module is the **single source of truth** for which documentation
 * versions exist (`versionsMeta`) and the pure logic that maps request slugs to
 * versions (`parseVersionPrefix`, `resolveVersion`, `isLatest`,
 * `classifyNotFoundContext`, `getSwitcherOrder`). It backs the following
 * correctness properties of the design:
 *   - Property 5  — unversioned paths always resolve to latest
 *   - Property 6  — version-prefix grammar
 *   - Property 7  — registered legacy paths resolve to their version
 *   - Property 8  — unregistered version prefixes are unknown
 *   - Property 10 — version switcher ordering and completeness
 *   - Property 12 — legacy banner visibility (via `isLatest`)
 *   - Property 21 — not-found version context classification
 *
 * ## Purity / no I/O
 *
 * Every export here is a pure function over plain version **metadata**
 * (`VersionMeta`) — no clipboard, network, filesystem, fumadocs loader, or
 * `@/.source` generated content is touched. This keeps the module directly
 * unit/PBT testable and runtime-agnostic. The fumadocs `source`
 * loader instance is intentionally **not** part of `VersionMeta`; task 6.1
 * (`lib/source.ts` wiring) attaches a real `source` per version by layering it
 * on top of this metadata to produce the `DocVersion` shape below.
 */

/** A documentation version's identifier: `'latest'` or a `v{N}` prefix. */
export type VersionId = 'latest' | `v${number}`

/**
 * Pure version metadata — the data the Version_Router, Version_Switcher,
 * Legacy_Banner, canonical metadata, and sitemap all consume.
 *
 * This deliberately carries **no** fumadocs `source`: keeping it source-free is
 * what lets every function in this module stay pure and importable by tests
 * without pulling in the loader or `@/.source` generated content. Task 6.1
 * attaches the real `source` to build a {@link DocVersion}.
 */
export type VersionMeta = {
  /** `'latest'` for the Latest_Version, else `v{N}` for a Legacy_Version. */
  id: VersionId
  /** Human-facing label, e.g. `'Latest'`, `'v2'`. */
  label: string
  /** The integer version number for legacy versions; `null` for latest. */
  versionNumber: number | null
  /** URL base path: `'/docs'` for latest, `'/docs/v{N}'` for legacy. */
  basePath: `/docs${'' | `/v${number}`}`
  /** `true` only for the Latest_Version. */
  isLatest: boolean
}

/**
 * A fully-wired version: {@link VersionMeta} plus the fumadocs loader `source`
 * instance for that version (per design's `DocVersion`). This module never
 * constructs one — task 6.1 binds `source` (a `ReturnType<typeof loader>`) onto
 * each `versionsMeta` entry. It is generic over the source type so this pure
 * module avoids importing the fumadocs loader.
 */
export type DocVersion<TSource = unknown> = VersionMeta & {
  /** The fumadocs loader source for this version (attached in task 6.1). */
  source: TSource
}

/**
 * The ordered version registry (most-recent-first), the single source of truth.
 *
 * Latest only for now; cutting a release (Version_Workflow, task 10.1) prepends
 * `{ id: 'v{N}', label: 'v{N}', versionNumber: N, basePath: '/docs/v{N}',
 * isLatest: false }` entries here. Task 6.1 layers a `source` onto each entry to
 * form the runtime `DocVersion[]`; the metadata order defined here is preserved.
 */
export const versionsMeta: readonly VersionMeta[] = [
  {
    id: 'latest',
    label: 'Latest',
    versionNumber: null,
    basePath: '/docs',
    isLatest: true,
  },
  {
    id: 'v2',
    label: 'v2',
    versionNumber: 2,
    basePath: '/docs/v2',
    isLatest: false,
  },
]

/**
 * The version-prefix grammar (Property 6): a positive integer with no leading
 * zeros. Matches `v1`, `v2`, `v42`; rejects `v0`, `v01`, `v1.2`, `V2`, `vx`.
 */
const VERSION_PREFIX_PATTERN = /^v([1-9]\d*)$/

/**
 * Parse a path segment as a version prefix.
 *
 * @returns the integer `N` iff `segment` matches `^v([1-9]\d*)$` (a positive
 * integer with no leading zeros), otherwise `null`.
 */
export function parseVersionPrefix(segment: string): number | null {
  const match = VERSION_PREFIX_PATTERN.exec(segment)
  const digits = match?.[1]
  if (digits === undefined) {
    return null
  }
  return Number.parseInt(digits, 10)
}

/**
 * The Latest_Version of a registry.
 *
 * @throws if the registry contains no Latest_Version — a registry-construction
 * invariant violation rather than a routing condition.
 */
export function getLatestVersion(registry: readonly VersionMeta[] = versionsMeta): VersionMeta {
  const latest = registry.find((version) => version.isLatest)
  if (latest === undefined) {
    throw new Error('Version registry must contain a Latest_Version')
  }
  return latest
}

/**
 * The result of resolving a request slug to a documentation version.
 *
 * - `latest` — no `/v{N}` prefix; served by the Latest_Version with `rest`
 *   equal to the whole slug.
 * - `legacy` — a registered `/v{N}` prefix; `rest` is the slug after the prefix.
 * - `unknownVersion` — a well-formed `/v{N}` prefix whose `N` is not registered;
 *   the caller responds 404 and must never serve another version's content.
 */
export type ResolveVersionResult =
  | { kind: 'latest'; version: VersionMeta; rest: string[] }
  | { kind: 'legacy'; version: VersionMeta; rest: string[] }
  | { kind: 'unknownVersion'; requested: number }

/**
 * Resolve a request slug to its documentation version (pure).
 *
 * Rules (design Version_Router, Properties 5/7/8):
 *   - `slug[0]` is not a version prefix (or slug is empty/absent) → Latest_Version
 *     with `rest` equal to the full slug. Never falls back to a legacy version.
 *   - `slug[0]` is a registered `/v{N}` → that Legacy_Version with
 *     `rest = slug.slice(1)`.
 *   - `slug[0]` is a well-formed `/v{N}` but `N` is not registered →
 *     `{ kind: 'unknownVersion', requested: N }`.
 *
 * @param slug the request path segments below the docs root (may be `undefined`
 * for the docs root itself).
 * @param registry the version registry to resolve against (defaults to
 * {@link versionsMeta}); injectable for testing.
 */
export function resolveVersion(
  slug: string[] | undefined,
  registry: readonly VersionMeta[] = versionsMeta,
): ResolveVersionResult {
  const segments = slug ?? []
  const first = segments[0]
  const requested = first === undefined ? null : parseVersionPrefix(first)

  if (requested === null) {
    return { kind: 'latest', version: getLatestVersion(registry), rest: segments }
  }

  const legacy = registry.find(
    (version) => !version.isLatest && version.versionNumber === requested,
  )
  if (legacy === undefined) {
    return { kind: 'unknownVersion', requested }
  }
  return { kind: 'legacy', version: legacy, rest: segments.slice(1) }
}

/** Predicate: is this the Latest_Version? (Drives Legacy_Banner visibility.) */
export function isLatest(version: VersionMeta): boolean {
  return version.isLatest
}

/**
 * The version context a Not_Found_Page should present for a requested slug.
 *
 * - `'latest'` — the path has no `/v{N}` segment (missing latest page).
 * - `{ kind: 'page-not-found-in-version', version }` — `/v{N}` where `N` is a
 *   registered version (the version exists, the page does not).
 * - `{ kind: 'version-not-found', requested }` — `/v{N}` where `N` is not
 *   registered (the version itself does not exist).
 */
export type NotFoundContext =
  | 'latest'
  | { kind: 'page-not-found-in-version'; version: VersionMeta }
  | { kind: 'version-not-found'; requested: number }

/**
 * Classify the version context of a not-found request (pure; Property 21).
 *
 * @param slug the request path segments below the docs root.
 * @param registry the version registry (defaults to {@link versionsMeta}).
 */
export function classifyNotFoundContext(
  slug: string[] | undefined,
  registry: readonly VersionMeta[] = versionsMeta,
): NotFoundContext {
  const segments = slug ?? []
  const first = segments[0]
  const requested = first === undefined ? null : parseVersionPrefix(first)

  if (requested === null) {
    return 'latest'
  }

  const legacy = registry.find(
    (version) => !version.isLatest && version.versionNumber === requested,
  )
  if (legacy === undefined) {
    return { kind: 'version-not-found', requested }
  }
  return { kind: 'page-not-found-in-version', version: legacy }
}

/**
 * The Version_Switcher ordering (Property 10): every registered version
 * most-recent-first — the Latest_Version first, then legacy versions by
 * descending version number. Returns a new array; does not mutate the registry.
 */
export function getSwitcherOrder(registry: readonly VersionMeta[] = versionsMeta): VersionMeta[] {
  return [...registry].sort((a, b) => {
    if (a.isLatest) {
      return -1
    }
    if (b.isLatest) {
      return 1
    }
    return (b.versionNumber ?? 0) - (a.versionNumber ?? 0)
  })
}

/**
 * Join a version `basePath` with a relative slug into a URL path.
 *
 * An empty (or absent) `relSlug` yields the version landing page (the bare
 * `basePath`); otherwise the segments are appended under it. Pure string
 * construction — no normalization of the slug segments themselves is performed
 * (callers pass already-decoded path segments).
 */
function joinDocsPath(basePath: VersionMeta['basePath'], relSlug: string[]): string {
  if (relSlug.length === 0) {
    return basePath
  }
  return `${basePath}/${relSlug.join('/')}`
}

/**
 * The URL path for a page identified by its version and relative slug (pure).
 *
 * An empty `relSlug` yields the version landing page (the bare `basePath`).
 * Public wrapper over the internal join so the sitemap, cut-version transform,
 * and other pure modules construct version-relative paths identically without
 * duplicating the rule. No I/O, no normalization of the segments themselves.
 */
export function docsPath(version: VersionMeta, relSlug: string[]): string {
  return joinDocsPath(version.basePath, relSlug)
}

/**
 * The navigation target when moving a page to another version (pure; Property
 * 11). Returns the path to the same relative slug in `target` when that page
 * exists there, otherwise the target's landing page (`target.basePath`).
 *
 * Existence checks require the fumadocs loader (I/O), so the predicate is
 * **injected** to keep this function pure and directly testable: the
 * route/components pass a real `getPage`-backed predicate, tests pass a fake.
 *
 * @param relSlug the current page's slug relative to its version's `basePath`.
 * @param target the version being navigated to.
 * @param pageExistsInTarget predicate: does `relSlug` resolve to a page in
 * `target`?
 * @returns the URL path within `target` (equivalent page, or its landing page).
 */
export function equivalentPath(
  relSlug: string[],
  target: VersionMeta,
  pageExistsInTarget: (relSlug: string[]) => boolean,
): string {
  if (pageExistsInTarget(relSlug)) {
    return joinDocsPath(target.basePath, relSlug)
  }
  return target.basePath
}

/** Options for {@link getCanonicalUrl}; injected to keep the function pure. */
export type CanonicalUrlOptions = {
  /** The site origin, e.g. `'https://docs.theroyalglow.in'` (no trailing path). */
  siteUrl: string
  /** The Latest_Version, used as the canonical target for equivalent legacy pages. */
  latest: VersionMeta
  /**
   * Predicate: does an equivalent page (same relative slug) exist in the
   * Latest_Version? Injected because the existence check requires the loader
   * (I/O); the route passes a real `getPage`-backed predicate, tests a fake.
   */
  equivalentExistsInLatest: (relSlug: string[]) => boolean
}

/**
 * Strip a single trailing slash from a site origin so joining with a path that
 * starts with `/` never produces a double slash.
 */
function trimTrailingSlash(siteUrl: string): string {
  return siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl
}

/**
 * Derive the canonical URL for a documentation page (pure; Property 13;
 * Req 9.1–9.4). Always returns exactly one absolute URL built from
 * `opts.siteUrl` + the derived path.
 *
 * Rules:
 *   - Latest_Version page → self-canonical (its own absolute URL).
 *   - Legacy_Version page WITH an equivalent Latest_Version page (same relative
 *     slug, per `opts.equivalentExistsInLatest`) → that latest page's URL.
 *   - Legacy_Version page WITHOUT an equivalent → legacy self-canonical.
 *
 * @param version the version of the page being rendered.
 * @param relSlug the page's slug relative to its version's `basePath`.
 * @param opts injected site origin, Latest_Version, and latest-equivalence
 * predicate.
 */
export function getCanonicalUrl(
  version: VersionMeta,
  relSlug: string[],
  opts: CanonicalUrlOptions,
): string {
  const origin = trimTrailingSlash(opts.siteUrl)

  if (version.isLatest || opts.equivalentExistsInLatest(relSlug)) {
    const target = version.isLatest ? version : opts.latest
    return `${origin}${joinDocsPath(target.basePath, relSlug)}`
  }

  return `${origin}${joinDocsPath(version.basePath, relSlug)}`
}

/** A robots directive: whether a page may be indexed and its links followed. */
export type RobotsDirective = { index: boolean; follow: boolean }

/**
 * The robots directive for a documentation page (pure; Property 15;
 * Req 9.6, 9.7). Always `{ index: true, follow: true }` for every version and
 * page — ranking is steered to the Latest_Version via the canonical link
 * (see {@link getCanonicalUrl}), not by suppressing indexing of legacy pages.
 */
export function robotsFor(_version: VersionMeta, _relSlug: string[]): RobotsDirective {
  return { index: true, follow: true }
}
