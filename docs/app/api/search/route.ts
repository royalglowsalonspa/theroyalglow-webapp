/**
 * Version-scoped documentation search endpoint (task 9.1; Requirements 11.2,
 * 11.3, 11.4, 11.5, 11.6).
 *
 * The default Fumadocs search client (enabled by `RootProvider` in
 * `app/layout.tsx`) issues `GET /api/search?query=...&tag=<versionId>`. This
 * route answers it with results scoped to the active Doc_Version.
 *
 * ## How version scoping works
 *
 * Fumadocs ships no multi-version search; it provides `createFromSource` over a
 * single loader source plus an Orama `tag` filter. We therefore build **one**
 * `SearchAPI` per registered version source (`versions` from `@/lib/source`),
 * and tag every page of a source with that version's id via the `buildIndex`
 * option (`tag: version.id`). The client's `tag` query param selects which
 * version is active; we route the query to that version's search server, which
 * — being built from a single source and re-filtered by `tag` — returns only
 * that version's pages (Req 11.2). An absent/unknown tag falls back to the
 * Latest_Version. Results are capped at 20 in relevance order (Req 11.3).
 *
 * The built-in `tag` filter already scopes results, so the pure
 * `scopeSearchResults` helper (`@/lib/search`) is not needed here; the cap is
 * applied via the search `limit` plus a defensive slice.
 *
 * ## Runtime portability
 *
 * `createFromSource` builds its Orama index lazily from in-memory sources on the
 * first query and caches it, so the route runs on any runtime with no filesystem
 * or native dependency. The content is
 * read-only and public, so no authentication is required — but this endpoint
 * SHOULD be rate-limited at the edge to prevent index-build abuse.
 *
 * The handler never throws: any internal failure is caught and returned as an
 * error response the client surfaces as "search temporarily unavailable",
 * preserving the reader's entered query (Req 11.6).
 */

import { createFromSource, type SearchAPI } from 'fumadocs-core/search/server'
import { SEARCH_RESULT_CAP } from '@/lib/search'
import { getVersion, versions } from '@/lib/source'
import type { VersionId } from '@/lib/versions'

/**
 * One Orama-backed `SearchAPI` per version, keyed by version id. Each indexes
 * only its own source's pages and tags every page with the version id so the
 * `tag` filter (and the client) can scope results to the active version.
 */
const searchByVersion: Map<VersionId, SearchAPI> = new Map(
  versions.map((version) => [
    version.id,
    createFromSource(version.source, {
      buildIndex: (page) => ({
        id: page.url,
        title: page.data.title,
        // `description` is optional under `exactOptionalPropertyTypes`; only
        // include the key when the page actually defines one.
        ...(page.data.description === undefined ? {} : { description: page.data.description }),
        url: page.url,
        structuredData: page.data.structuredData,
        tag: version.id,
      }),
    }),
  ]),
)

/**
 * Resolve the active version id from the client's `tag` query param. A tag that
 * matches a registered version is used as-is; anything else (absent, unknown,
 * malformed) falls back to the Latest_Version so search never errors on an
 * unrecognised scope.
 */
function resolveActiveVersionId(tag: string | null): VersionId {
  if (tag !== null && getVersion(tag) !== undefined) {
    return tag as VersionId
  }
  return 'latest'
}

/**
 * `GET /api/search` — version-scoped, relevance-ordered, capped search.
 *
 * - Empty/absent `query` → empty result array (client shows no-results; Req
 *   11.4), mirroring the Fumadocs endpoint contract.
 * - Otherwise → at most {@link SEARCH_RESULT_CAP} results from the active
 *   version, in relevance order (Req 11.2, 11.3).
 * - Any internal error → HTTP 500 error payload the client renders as "search
 *   temporarily unavailable" while keeping the typed query (Req 11.6). The
 *   handler is non-throwing so it stays edge-safe.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const query = url.searchParams.get('query')

    if (query === null || query.length === 0) {
      return Response.json([])
    }

    const versionId = resolveActiveVersionId(url.searchParams.get('tag'))
    const api = searchByVersion.get(versionId) ?? searchByVersion.get('latest')

    if (api === undefined) {
      return Response.json({ message: 'search temporarily unavailable' }, { status: 500 })
    }

    const results = await api.search(query, {
      tag: versionId,
      limit: SEARCH_RESULT_CAP,
    })

    return Response.json(results.slice(0, SEARCH_RESULT_CAP))
  } catch {
    return Response.json({ message: 'search temporarily unavailable' }, { status: 500 })
  }
}
