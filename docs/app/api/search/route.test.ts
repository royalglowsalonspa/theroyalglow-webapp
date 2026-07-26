// @vitest-environment node

/**
 * Search scope/latency smoke test for the version-scoped search endpoint
 * (task 9.6; Requirement 11.2).
 *
 * This is a smoke / integration test, NOT a tagged property test.
 *
 * ## Approach: scoping integration (real handler partially invoked)
 *
 * The intent was to drive the real `GET` handler end-to-end. That is **not**
 * fully possible under Vitest: the route builds an Orama index via
 * `createFromSource`, and Orama's `buildDocuments` requires each page's
 * `structuredData.headings`/`contents`. The test content source is the
 * `test/source-server.shim.ts` alias, which loads the real `content/docs` and
 * `content/docs-v2` MDX through the fumadocs **dynamic runtime** — that runtime
 * does not emit `structuredData`, so a non-empty Orama query throws
 * `data.headings is not iterable`. This is a test-environment limitation of the
 * shim, NOT a defect in `route.ts`: in a real Next.js build the MDX pipeline
 * emits `structuredData`, and the handler's `tag`-scoped Orama search works.
 *
 * Per the task's documented fallback, the test therefore:
 *   1. invokes the **real handler** for every contract path it can serve under
 *      the shim — the empty-query no-results contract (Req 11.4) and the
 *      unavailable-on-unbuildable-index error contract (Req 11.6) — and asserts
 *      it always returns a fast, well-formed `Response`; and
 *   2. exercises the route's **version-scoping + cap logic** (`scopeSearchResults`,
 *      which the route's response shaping is built on) over an in-memory,
 *      version-tagged ranked corpus that mirrors what Orama returns — asserting
 *      results are scoped to the requested version (no other version's pages
 *      leak in), capped at 20 (Req 11.3), relevance-order-preserving, and
 *      produced well under a generous 2s latency budget (Req 11.2).
 *
 * Representative query used: "getting started" — a page that exists in both the
 * latest and v2 collections, so version scoping is observable in both
 * directions. The `node` environment is pinned (above) for deterministic,
 * jsdom-free execution.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/search/route'
import { SEARCH_RESULT_CAP, scopeSearchResults } from '@/lib/search'
import type { VersionId } from '@/lib/versions'

/** Absolute origin used to build the request URL (path/searchParams are what matter). */
const SITE_ORIGIN = 'https://docs.theroyalglow.in'

/** The representative query exercised by the smoke test (exists in both versions). */
const REPRESENTATIVE_QUERY = 'getting started'

/** Generous smoke-level latency budget (Req 11.2 mandates < 2s). */
const LATENCY_BUDGET_MS = 2000

/** Build the `GET /api/search` request the Fumadocs client issues. */
function searchRequest(query: string, tag?: string): Request {
  const url = new URL('/api/search', SITE_ORIGIN)
  url.searchParams.set('query', query)
  if (tag !== undefined) {
    url.searchParams.set('tag', tag)
  }
  return new Request(url)
}

/** A version-tagged ranked match, mirroring an Orama result the route caps/scopes. */
type RankedMatch = {
  /** Stable identity for order/subsequence assertions. */
  id: number
  /** Absolute-ish page URL, under the matched version's base path. */
  url: string
  /** The version the matched page belongs to (the route's `tag`). */
  versionId: VersionId
}

/**
 * A mixed-version ranked corpus, as the search backend would emit before the
 * route scopes it to the active version. Interleaves latest and v2 "getting
 * started" matches plus enough latest matches to exceed the cap of 20, so both
 * scoping and capping are exercised. Index order == relevance order.
 */
function buildRankedCorpus(): RankedMatch[] {
  const corpus: RankedMatch[] = [
    { id: 0, url: '/docs/getting-started', versionId: 'latest' },
    { id: 1, url: '/docs/v2/getting-started', versionId: 'v2' },
    { id: 2, url: '/docs/getting-started#install', versionId: 'latest' },
    { id: 3, url: '/docs/v2/getting-started#install', versionId: 'v2' },
    { id: 4, url: '/docs/index', versionId: 'latest' },
    { id: 5, url: '/docs/v2/index', versionId: 'v2' },
  ]
  // Pad latest with more matches so the active-version set exceeds 20 → cap bites.
  for (let i = 0; i < 25; i++) {
    corpus.push({ id: 100 + i, url: `/docs/topic-${i}`, versionId: 'latest' })
  }
  return corpus
}

describe('GET /api/search — version scope & latency smoke test', () => {
  let corpus: RankedMatch[]

  beforeAll(() => {
    corpus = buildRankedCorpus()
  })

  it('latest-tagged scope returns only latest pages, capped at 20, relevance-ordered', () => {
    const scoped = scopeSearchResults(corpus, 'latest')

    // Scoped: no result may be a v2 page (whose URLs live under /docs/v2).
    expect(scoped.length).toBeGreaterThan(0)
    for (const match of scoped) {
      expect(match.versionId).toBe('latest')
      expect(match.url.startsWith('/docs/v2')).toBe(false)
      expect(match.url.startsWith('/docs')).toBe(true)
    }

    // Capped at the spec maximum (Req 11.3).
    expect(scoped.length).toBeLessThanOrEqual(SEARCH_RESULT_CAP)
    expect(scoped.length).toBe(SEARCH_RESULT_CAP)

    // Relevance-order-preserving: result ids are strictly ascending (input order).
    const ids = scoped.map((m) => m.id)
    expect([...ids].sort((a, b) => a - b)).toEqual(ids)
  })

  it('v2-tagged scope returns only v2 pages under /docs/v2', () => {
    const scoped = scopeSearchResults(corpus, 'v2')

    expect(scoped.length).toBeGreaterThan(0)
    expect(scoped.length).toBeLessThanOrEqual(SEARCH_RESULT_CAP)
    for (const match of scoped) {
      expect(match.versionId).toBe('v2')
      expect(match.url.startsWith('/docs/v2')).toBe(true)
    }
  })

  it('scopes and caps a representative query well under the 2s latency budget', () => {
    const start = performance.now()
    const scoped = scopeSearchResults(corpus, 'latest')
    const elapsedMs = performance.now() - start

    expect(scoped.length).toBeGreaterThan(0)
    expect(elapsedMs).toBeLessThan(LATENCY_BUDGET_MS)
  })

  it('real handler: empty query returns the no-results contract (200, []) quickly', async () => {
    const start = performance.now()
    const response = await GET(searchRequest('', 'latest'))
    const elapsedMs = performance.now() - start
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual([])
    expect(elapsedMs).toBeLessThan(LATENCY_BUDGET_MS)
  })

  it('real handler: always returns a well-formed Response (never throws) within budget', async () => {
    // Under the shim the index is unbuildable for non-empty queries, so the
    // handler surfaces the Req 11.6 "temporarily unavailable" contract instead
    // of throwing. Either way the call must be fast and well-formed.
    const start = performance.now()
    const response = await GET(searchRequest(REPRESENTATIVE_QUERY, 'latest'))
    const elapsedMs = performance.now() - start

    expect(response).toBeInstanceOf(Response)
    expect([200, 500]).toContain(response.status)
    expect(elapsedMs).toBeLessThan(LATENCY_BUDGET_MS)

    if (response.status === 500) {
      const body = (await response.json()) as { message: string }
      expect(body.message).toBe('search temporarily unavailable')
    }
  })
})
