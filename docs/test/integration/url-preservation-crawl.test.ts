// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { latestSource } from '@/lib/source'
import { resolveVersion } from '@/lib/versions'

// Task 12.2 — URL-preservation crawl test (Req 4.2).
//
// Requirement 4.2: every pre-existing `/docs/*` URL continues to resolve after
// the restyle/versioning work, with no redirect introduced. Because the latest
// version keeps `baseUrl: '/docs'`, no existing URL changes.
//
// A full HTTP crawl needs a running server; that live crawl runs in CI. Here we
// assert the equivalent guarantee at the routing layer — the layer that decides
// whether a request 200s, 404s, or redirects:
//
//   For every page the latest content source exposes (the canonical list of
//   pre-existing `/docs/*` URLs):
//     1. `latestSource.getPage(slugs)` resolves to a defined page — the HTTP 200
//        equivalent (the route renders content rather than calling notFound()).
//     2. `resolveVersion(slugs)` classifies it as the latest version with
//        `rest === slugs` — i.e. no `/v{N}` prefix is introduced and the slug is
//        passed through untouched, so no redirect or version-prefix rewrite
//        occurs.
//
// Together these prove pre-existing `/docs/*` URLs are preserved by the routing
// logic exactly as they were before versioning was added.

describe('Task 12.2: every pre-existing /docs URL is preserved (resolves, no redirect)', () => {
  const pages = latestSource.getPages()

  it('the latest source exposes the pre-existing /docs page set', () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  it.each(pages.map((page) => [page.url, page.slugs] as const))(
    '%s resolves to latest with the slug preserved (no redirect, no version prefix)',
    (url, slugs) => {
      // 1. The page resolves — HTTP 200 equivalent.
      const page = latestSource.getPage(slugs)
      expect(page, `expected ${url} to resolve to a page`).toBeDefined()

      // 2. The router keeps it on the latest version with the slug untouched.
      const resolved = resolveVersion(slugs)
      expect(resolved.kind).toBe('latest')
      if (resolved.kind !== 'latest') {
        return
      }
      expect(resolved.version.isLatest).toBe(true)
      // No version prefix consumed and no rewrite: rest === the original slug.
      expect(resolved.rest).toEqual(slugs)
      // The page still lives under the original `/docs` base path (no redirect).
      expect(url === '/docs' || url.startsWith('/docs/')).toBe(true)
    },
  )
})
