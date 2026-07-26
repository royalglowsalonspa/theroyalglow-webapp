import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type BuildSitemapInput, buildSitemap } from '@/lib/sitemap'

// Feature: docs-theming-and-versioning, Property 14: Sitemap coverage is exact and duplicate-free
//
// buildSitemap must emit, as absolute URLs, exactly the union of every page
// across every version — each distinct URL appearing once (duplicate-free) and
// no URL missing or extra (exact). The independent oracle below recomputes the
// expected URL set from the input using the design's join rule (origin with one
// trailing slash trimmed + basePath + '/' + relSlug join; empty relSlug =>
// bare basePath) and asserts set-equality plus duplicate-freeness, without
// depending on the output's internal ordering.

// A small, fixed pool of path segments. Drawing relative slugs from this pool
// naturally produces repeated pages (both within and across versions), which is
// exactly the duplicate pressure needed to prove de-duplication.
const segmentArb = fc.constantFrom(
  'getting-started',
  'intro',
  'guide',
  'api',
  'a',
  'b',
  'c',
  'setup',
)

// A relative slug: 0..4 segments. An empty array denotes the version landing page.
const relSlugArb = fc.array(segmentArb, { maxLength: 4 })

// A small pool of base paths. Repeating base paths across versions adds further
// duplicate coverage (two versions claiming the same base path + slug collide).
const basePathArb = fc.constantFrom('/docs', '/docs/v2', '/docs/v3', '/docs/v10')

const versionArb = fc.record({
  basePath: basePathArb,
  relSlugs: fc.array(relSlugArb, { maxLength: 6 }),
})

// Origins with and without a single trailing slash, to exercise trimming.
const siteUrlArb = fc
  .tuple(
    fc.constantFrom('https://docs.theroyalglow.in', 'https://example.com', 'https://a.b'),
    fc.boolean(),
  )
  .map(([origin, withSlash]) => (withSlash ? `${origin}/` : origin))

const inputArb: fc.Arbitrary<BuildSitemapInput> = fc.record({
  siteUrl: siteUrlArb,
  versions: fc.array(versionArb, { maxLength: 4 }),
})

/** Independent oracle: every page URL (with duplicates) the input describes. */
function expectedUrlsWithDuplicates(input: BuildSitemapInput): string[] {
  const origin = input.siteUrl.endsWith('/') ? input.siteUrl.slice(0, -1) : input.siteUrl
  const urls: string[] = []
  for (const version of input.versions) {
    for (const relSlug of version.relSlugs) {
      const path =
        relSlug.length === 0 ? version.basePath : `${version.basePath}/${relSlug.join('/')}`
      urls.push(`${origin}${path}`)
    }
  }
  return urls
}

describe('buildSitemap', () => {
  it('Property 14: output is the exact, duplicate-free union of every page across versions', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = buildSitemap(input)
        const expectedSet = new Set(expectedUrlsWithDuplicates(input))

        // Duplicate-free: no URL appears twice.
        expect(new Set(result).size).toBe(result.length)

        // Exact: the result set equals the union of all described pages.
        // length === |expectedSet| with no extras and full subset coverage
        // together force exact set-equality.
        expect(result.length).toBe(expectedSet.size)
        for (const url of result) {
          expect(expectedSet.has(url)).toBe(true)
        }
        for (const url of expectedSet) {
          expect(result).toContain(url)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('emits absolute URLs and treats an empty relative slug as the landing page', () => {
    const result = buildSitemap({
      siteUrl: 'https://docs.theroyalglow.in/',
      versions: [
        { basePath: '/docs', relSlugs: [[], ['intro'], ['intro']] },
        { basePath: '/docs/v2', relSlugs: [[]] },
      ],
    })

    expect(result).toEqual([
      'https://docs.theroyalglow.in/docs',
      'https://docs.theroyalglow.in/docs/intro',
      'https://docs.theroyalglow.in/docs/v2',
    ])
  })
})
