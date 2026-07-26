import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  classifyNotFoundContext,
  equivalentPath,
  getCanonicalUrl,
  getLatestVersion,
  getSwitcherOrder,
  isLatest,
  parseVersionPrefix,
  resolveVersion,
  robotsFor,
  type VersionMeta,
  versionsMeta,
} from '@/lib/versions'

// ---------------------------------------------------------------------------
// Shared fixtures and arbitraries
//
// All registries below satisfy the construction invariant that exactly one
// Latest_Version is present (getLatestVersion throws otherwise). Legacy version
// numbers are unique positive integers; latest carries versionNumber null.
// ---------------------------------------------------------------------------

const latestMeta: VersionMeta = {
  id: 'latest',
  label: 'Latest',
  versionNumber: null,
  basePath: '/docs',
  isLatest: true,
}

function makeLegacy(n: number): VersionMeta {
  return {
    id: `v${n}`,
    label: `v${n}`,
    versionNumber: n,
    basePath: `/docs/v${n}`,
    isLatest: false,
  }
}

/** Expected URL path for a version base + relative slug (mirrors docsPath). */
function expectedPath(base: string, relSlug: string[]): string {
  return relSlug.length === 0 ? base : `${base}/${relSlug.join('/')}`
}

const NUM_RUNS = 100

/** Distinct legacy version numbers (positive ints, no leading-zero concerns). */
const legacyNumbersArb = fc.uniqueArray(fc.integer({ min: 1, max: 999 }), {
  maxLength: 6,
})

/** A registry: one latest + zero-or-more distinct legacy versions. */
const registryArb: fc.Arbitrary<VersionMeta[]> = legacyNumbersArb.map((nums) => [
  latestMeta,
  ...nums.map(makeLegacy),
])

/** A registry guaranteed to hold at least one legacy version. */
const registryWithLegacyArb: fc.Arbitrary<VersionMeta[]> = fc
  .uniqueArray(fc.integer({ min: 1, max: 999 }), { minLength: 1, maxLength: 6 })
  .map((nums) => [latestMeta, ...nums.map(makeLegacy)])

/** Arbitrary path segments (any strings). */
const segmentArb = fc.string()

/** A slug whose first segment is NOT a well-formed version prefix at all. */
const nonVersionSlugArb = fc
  .array(segmentArb)
  .filter((s) => s.length === 0 || parseVersionPrefix(s[0] as string) === null)

/** Safe, protocol-free path segments for URL-construction properties. */
const safeSegmentArb = fc.constantFrom(
  'getting-started',
  'guide',
  'intro',
  'setup',
  'api',
  'nested',
  'x',
)
const safeSlugArb = fc.array(safeSegmentArb)

describe('versions — pure version registry and resolution', () => {
  // -------------------------------------------------------------------------
  // Task 3.2 / Property 6
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 6: a string is a version prefix yielding integer N iff it matches ^v([1-9]\d*)$ (positive integer, no leading zeros)
  it('parseVersionPrefix accepts only v + positive int (no leading zeros)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (n) => {
        expect(parseVersionPrefix(`v${n}`)).toBe(n)
      }),
      { numRuns: NUM_RUNS },
    )

    // Explicit rejections required by the grammar.
    for (const bad of ['v0', 'v01', 'v00', 'v1.2', 'V2', 'vx', 'v', '2', 'v-1', ' v2', 'v2 ']) {
      expect(parseVersionPrefix(bad)).toBeNull()
    }

    // Random non-matching strings are never treated as a version prefix.
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^v([1-9]\d*)$/.test(s)),
        (s) => {
          expect(parseVersionPrefix(s)).toBeNull()
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 3.3 / Property 5
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 5: any slug whose first segment is not a registered vN prefix resolves to the Latest_Version, never a Legacy_Version
  it('unversioned paths always resolve to latest, never legacy', () => {
    fc.assert(
      fc.property(registryArb, nonVersionSlugArb, (registry, slug) => {
        const result = resolveVersion(slug, registry)
        expect(result.kind).toBe('latest')
        expect(result.kind).not.toBe('legacy')
        if (result.kind === 'latest') {
          expect(result.version.isLatest).toBe(true)
          expect(result.rest).toEqual(slug)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 3.4 / Property 4
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 4: any pre-existing URL (slug with no version prefix) resolves to latest with rest deep-equal to the original slug, with no mutation or redirect
  it('pre-existing URLs are preserved (rest deep-equals slug, no redirect)', () => {
    fc.assert(
      fc.property(nonVersionSlugArb, (slug) => {
        const before = [...slug]
        const result = resolveVersion(slug, versionsMeta)
        expect(result.kind).toBe('latest')
        if (result.kind === 'latest') {
          expect(result.rest).toEqual(before)
          expect(result.version.basePath).toBe('/docs')
        }
        // No mutation of the caller's slug array.
        expect(slug).toEqual(before)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 3.5 / Property 7
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 7: for any registered Legacy_Version, resolveVersion(['v{N}', ...rest]) returns kind 'legacy' with the matching version and rest equal to the remainder
  it('registered legacy paths resolve to their version', () => {
    const caseArb = registryWithLegacyArb.chain((registry) => {
      const legacy = registry.filter((v) => !v.isLatest)
      return fc.record({
        registry: fc.constant(registry),
        pick: fc.integer({ min: 0, max: legacy.length - 1 }),
        rest: fc.array(segmentArb),
      })
    })

    fc.assert(
      fc.property(caseArb, ({ registry, pick, rest }) => {
        const legacy = registry.filter((v) => !v.isLatest)
        const target = legacy[pick] as VersionMeta
        const slug = [`v${target.versionNumber}`, ...rest]
        const result = resolveVersion(slug, registry)
        expect(result.kind).toBe('legacy')
        if (result.kind === 'legacy') {
          expect(result.version.versionNumber).toBe(target.versionNumber)
          expect(result.version.id).toBe(target.id)
          expect(result.rest).toEqual(rest)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 3.6 / Property 8
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 8: for any positive integer N not in the registry, resolveVersion(['v{N}', ...]) returns kind 'unknownVersion' with requested === N and serves no other version's content
  it('unregistered version prefixes are unknown', () => {
    const caseArb = legacyNumbersArb.chain((nums) =>
      fc.record({
        nums: fc.constant(nums),
        n: fc.integer({ min: 1, max: 5000 }).filter((x) => !nums.includes(x)),
        rest: fc.array(segmentArb),
      }),
    )

    fc.assert(
      fc.property(caseArb, ({ nums, n, rest }) => {
        const registry = [latestMeta, ...nums.map(makeLegacy)]
        const result = resolveVersion([`v${n}`, ...rest], registry)
        expect(result.kind).toBe('unknownVersion')
        if (result.kind === 'unknownVersion') {
          expect(result.requested).toBe(n)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 3.7 / Property 10
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 10: getSwitcherOrder returns a permutation of the registry, latest first then legacy versions by descending versionNumber, with no additions or drops
  it('switcher ordering is complete, latest-first, legacy-descending', () => {
    fc.assert(
      fc.property(registryArb, (registry) => {
        const ordered = getSwitcherOrder(registry)

        // Permutation: same multiset of ids, same length (no adds/drops).
        expect(ordered).toHaveLength(registry.length)
        expect([...ordered.map((v) => v.id)].sort()).toEqual([...registry.map((v) => v.id)].sort())

        // Latest is first.
        expect((ordered[0] as VersionMeta).isLatest).toBe(true)

        // Legacy tail is strictly descending by versionNumber.
        const legacy = ordered.slice(1)
        for (let i = 1; i < legacy.length; i++) {
          const prev = legacy[i - 1] as VersionMeta
          const cur = legacy[i] as VersionMeta
          expect(prev.isLatest).toBe(false)
          expect(cur.isLatest).toBe(false)
          expect(prev.versionNumber as number).toBeGreaterThan(cur.versionNumber as number)
        }

        // Does not mutate the input registry order.
        expect(registry[0]).toBe(latestMeta)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 3.8 / Property 12
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 12: isLatest(v) is true iff v.isLatest, and the legacy banner is visible exactly when !isLatest
  it('legacy banner visibility follows isLatest', () => {
    fc.assert(
      fc.property(registryArb, (registry) => {
        for (const version of registry) {
          expect(isLatest(version)).toBe(version.isLatest)
          const bannerVisible = !isLatest(version)
          expect(bannerVisible).toBe(!version.isLatest)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 3.9 / Property 21
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 21: classifyNotFoundContext returns 'latest' for unversioned slugs, 'version-not-found' for unregistered vN, and 'page-not-found-in-version' for registered vN
  it('not-found context classification distinguishes the three cases', () => {
    // Case A: unversioned slug → 'latest'.
    fc.assert(
      fc.property(registryArb, nonVersionSlugArb, (registry, slug) => {
        expect(classifyNotFoundContext(slug, registry)).toBe('latest')
      }),
      { numRuns: NUM_RUNS },
    )

    // Case B: registered vN → page-not-found-in-version.
    const registeredCaseArb = registryWithLegacyArb.chain((registry) => {
      const legacy = registry.filter((v) => !v.isLatest)
      return fc.record({
        registry: fc.constant(registry),
        pick: fc.integer({ min: 0, max: legacy.length - 1 }),
        rest: fc.array(segmentArb),
      })
    })
    fc.assert(
      fc.property(registeredCaseArb, ({ registry, pick, rest }) => {
        const legacy = registry.filter((v) => !v.isLatest)
        const target = legacy[pick] as VersionMeta
        const ctx = classifyNotFoundContext([`v${target.versionNumber}`, ...rest], registry)
        expect(typeof ctx).toBe('object')
        if (typeof ctx === 'object') {
          expect(ctx.kind).toBe('page-not-found-in-version')
          if (ctx.kind === 'page-not-found-in-version') {
            expect(ctx.version.versionNumber).toBe(target.versionNumber)
          }
        }
      }),
      { numRuns: NUM_RUNS },
    )

    // Case C: unregistered vN → version-not-found.
    const unregisteredCaseArb = legacyNumbersArb.chain((nums) =>
      fc.record({
        nums: fc.constant(nums),
        n: fc.integer({ min: 1, max: 5000 }).filter((x) => !nums.includes(x)),
        rest: fc.array(segmentArb),
      }),
    )
    fc.assert(
      fc.property(unregisteredCaseArb, ({ nums, n, rest }) => {
        const registry = [latestMeta, ...nums.map(makeLegacy)]
        const ctx = classifyNotFoundContext([`v${n}`, ...rest], registry)
        expect(typeof ctx).toBe('object')
        if (typeof ctx === 'object') {
          expect(ctx.kind).toBe('version-not-found')
          if (ctx.kind === 'version-not-found') {
            expect(ctx.requested).toBe(n)
          }
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

describe('versions — equivalence, canonical, robots', () => {
  // -------------------------------------------------------------------------
  // Task 4.2 / Property 11
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 11: equivalentPath returns the same-slug path in the target when it exists there, else the target landing page; round-trip A→B→A on a page present in both yields the original path
  it('equivalentPath maps to equivalent-or-landing and round-trips', () => {
    // Direct behavior: exists → target base + rest; missing → target base.
    fc.assert(
      fc.property(registryArb, safeSlugArb, fc.boolean(), (registry, relSlug, exists) => {
        const target = registry[registry.length - 1] as VersionMeta
        const path = equivalentPath(relSlug, target, () => exists)
        if (exists) {
          expect(path).toBe(expectedPath(target.basePath, relSlug))
        } else {
          expect(path).toBe(target.basePath)
        }
      }),
      { numRuns: NUM_RUNS },
    )

    // Round-trip invariance: a page present in both A and B maps A→B→A back to
    // its original A-relative path.
    const roundTripArb = registryWithLegacyArb.chain((registry) =>
      fc.record({
        registry: fc.constant(registry),
        a: fc.integer({ min: 0, max: registry.length - 1 }),
        b: fc.integer({ min: 0, max: registry.length - 1 }),
        relSlug: fc.array(safeSegmentArb, { minLength: 1 }),
      }),
    )
    fc.assert(
      fc.property(roundTripArb, ({ registry, a, b, relSlug }) => {
        const versionA = registry[a] as VersionMeta
        const versionB = registry[b] as VersionMeta
        const existsEverywhere = () => true

        // A→B yields B's path for the same relative slug.
        const toB = equivalentPath(relSlug, versionB, existsEverywhere)
        expect(toB).toBe(expectedPath(versionB.basePath, relSlug))

        // B→A returns the original A-relative path (round-trip).
        const backToA = equivalentPath(relSlug, versionA, existsEverywhere)
        expect(backToA).toBe(expectedPath(versionA.basePath, relSlug))
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 4.3 / Property 13
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 13: getCanonicalUrl yields self-canonical for latest, the latest URL for a legacy page with a latest equivalent, legacy self otherwise, and always exactly one absolute https URL under siteUrl
  it('canonical URL derivation is correct and always a single absolute https URL', () => {
    const siteUrlArb = fc.constantFrom(
      'https://docs.theroyalglow.in',
      'https://docs.theroyalglow.in/',
      'https://example.com',
    )

    const caseArb = registryWithLegacyArb.chain((registry) =>
      fc.record({
        registry: fc.constant(registry),
        idx: fc.integer({ min: 0, max: registry.length - 1 }),
        relSlug: safeSlugArb,
        siteUrl: siteUrlArb,
        equivalentExists: fc.boolean(),
      }),
    )

    fc.assert(
      fc.property(caseArb, ({ registry, idx, relSlug, siteUrl, equivalentExists }) => {
        const version = registry[idx] as VersionMeta
        const latest = getLatestVersion(registry)
        const origin = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl

        const url = getCanonicalUrl(version, relSlug, {
          siteUrl,
          latest,
          equivalentExistsInLatest: () => equivalentExists,
        })

        // Always exactly one absolute https URL under the (trimmed) origin.
        expect(url.startsWith('https://')).toBe(true)
        expect(url.startsWith(origin)).toBe(true)
        expect((url.match(/https:\/\//g) ?? []).length).toBe(1)

        if (version.isLatest) {
          // Latest → self-canonical.
          expect(url).toBe(`${origin}${expectedPath(version.basePath, relSlug)}`)
        } else if (equivalentExists) {
          // Legacy with a latest equivalent → latest URL.
          expect(url).toBe(`${origin}${expectedPath(latest.basePath, relSlug)}`)
        } else {
          // Legacy without equivalent → legacy self.
          expect(url).toBe(`${origin}${expectedPath(version.basePath, relSlug)}`)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // -------------------------------------------------------------------------
  // Task 4.4 / Property 15
  // -------------------------------------------------------------------------

  // Feature: docs-theming-and-versioning, Property 15: robotsFor returns { index: true, follow: true } for every version and every slug
  it('robots directive is always index+follow', () => {
    fc.assert(
      fc.property(registryArb, safeSlugArb, (registry, relSlug) => {
        for (const version of registry) {
          expect(robotsFor(version, relSlug)).toEqual({ index: true, follow: true })
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
