// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { latestSource, v2Source, versions } from '@/lib/source'

// Task 12.1 — build-with-multiple-versions integration test (Req 10.5).
//
// Requirement 10.5: when the Docs_Site is built with two or more Doc_Versions
// present (Latest_Version + at least one Legacy_Version), the build completes
// with no errors and produces navigable output for EVERY present version.
//
// Running a full `next build` inside Vitest is too heavy and slow, so this test
// asserts the same guarantee at two complementary layers:
//
//   1. Runtime sources — the multi-version content sources wired in
//      `@/lib/source` (latest under `/docs`, v2 under `/docs/v2`) both expose a
//      navigable, version-scoped set of pages. This is the build INPUT that
//      `generateStaticParams` unions to emit one route per page per version.
//   2. Prerender manifest (if present) — when a prior `next build` produced
//      `docs/.next/prerender-manifest.json`, it must contain both latest
//      `/docs/*` routes AND `/docs/v2*` routes, proving the live build emitted
//      navigable output for both versions. When the manifest is absent (a clean
//      checkout / no prior build) that assertion is skipped gracefully; the
//      live-build assertion runs in CI where the build always precedes tests.
//
// `@/lib/source` runs unchanged here: the Vitest config aliases
// `@/.source/server` to `test/source-server.shim.ts`, which loads the same real
// `content/docs` and `content/docs-v2` content through the fumadocs dynamic
// runtime. See test/source-server.shim.ts.

const DOCS_ROOT = resolve(__dirname, '..', '..')
const PRERENDER_MANIFEST = join(DOCS_ROOT, '.next', 'prerender-manifest.json')

/** Is a route owned by the latest version (`/docs/*`) but NOT a `/docs/v2*` route? */
function isLatestRoute(route: string): boolean {
  if (!(route === '/docs' || route.startsWith('/docs/'))) {
    return false
  }
  return !(route === '/docs/v2' || route.startsWith('/docs/v2/'))
}

/** Is a route a legacy v2 route (`/docs/v2` or `/docs/v2/*`)? */
function isV2Route(route: string): boolean {
  return route === '/docs/v2' || route.startsWith('/docs/v2/')
}

describe('Task 12.1: build with multiple versions emits navigable output for both versions', () => {
  it('the version registry wires both the latest and the v2 legacy version', () => {
    const ids = versions.map((version) => version.id)
    expect(ids).toContain('latest')
    expect(ids).toContain('v2')
  })

  it('the latest version produces navigable pages under /docs (never /docs/v2)', () => {
    const pages = latestSource.getPages()
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      expect(page.url === '/docs' || page.url.startsWith('/docs/')).toBe(true)
      expect(page.url === '/docs/v2' || page.url.startsWith('/docs/v2/')).toBe(false)
    }
  })

  it('the v2 legacy version produces navigable pages, all under /docs/v2', () => {
    const pages = v2Source.getPages()
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      expect(page.url === '/docs/v2' || page.url.startsWith('/docs/v2/')).toBe(true)
    }
  })

  // Live-build assertion: only runs when a prior `next build` left a prerender
  // manifest behind. In CI the build always precedes the test run so this is
  // exercised; on a clean local checkout it skips rather than failing.
  const manifestExists = existsSync(PRERENDER_MANIFEST)

  it.skipIf(!manifestExists)(
    'the prerender manifest contains both latest /docs routes and /docs/v2 routes',
    () => {
      const manifest = JSON.parse(readFileSync(PRERENDER_MANIFEST, 'utf-8')) as {
        routes?: Record<string, unknown>
      }
      const routes = Object.keys(manifest.routes ?? {})

      const latestRoutes = routes.filter(isLatestRoute)
      const v2Routes = routes.filter(isV2Route)

      // Both versions emitted prerendered, navigable output in the live build.
      expect(latestRoutes.length).toBeGreaterThan(0)
      expect(v2Routes.length).toBeGreaterThan(0)
      // The base landing route of each version is present and navigable.
      expect(routes).toContain('/docs')
      expect(routes).toContain('/docs/v2')
    },
  )
})
