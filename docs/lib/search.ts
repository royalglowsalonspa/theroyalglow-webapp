/**
 * Pure version-scoping of search results for the Docs_Site (task 4.7;
 * Requirements 11.2, 11.3).
 *
 * `scopeSearchResults` takes the ranked matches produced by the search backend
 * (Orama, indexed over **all** version sources with each page tagged by its
 * version id) and returns only the **active version's** results, capped, in
 * relevance order. It backs:
 *   - Property 18 — search results are version-scoped and capped
 *
 * ## Purity / no I/O
 *
 * Indexing and ranking are performed by the backend (`app/api/search/route.ts`);
 * this module only filters and caps the already-ranked list, so it is a pure
 * function over plain data — directly unit/PBT testable and edge-compatible.
 */

import type { VersionId } from './versions'

/**
 * The maximum number of results returned for a query (Req 11.3). Callers may
 * override via {@link ScopeSearchOptions.limit}, but the default is the spec cap.
 */
export const SEARCH_RESULT_CAP = 20

/**
 * The minimum shape a search match must carry to be version-scoped: the id of
 * the version the matched page belongs to. Concrete matches carry additional
 * fields (id, title, url, content excerpt, score) which are preserved untouched.
 */
export type VersionTaggedMatch = {
  /** The version id (`'latest'` or `v{N}`) the matched page belongs to. */
  versionId: VersionId
}

/** Injected options for {@link scopeSearchResults}. */
export type ScopeSearchOptions = {
  /** Maximum results to return; defaults to {@link SEARCH_RESULT_CAP} (20). */
  limit?: number
}

/**
 * Scope ranked search matches to the active version and cap them (pure;
 * Property 18; Req 11.2, 11.3).
 *
 * Behaviour:
 *   - keeps only matches whose `versionId` equals `activeVersion` (Req 11.2);
 *   - preserves the input's relevance order (the backend already ranked them);
 *   - returns at most `opts.limit` (default {@link SEARCH_RESULT_CAP} = 20)
 *     results (Req 11.3).
 *
 * A non-positive `limit` yields an empty array. The input is never mutated.
 *
 * @typeParam T the concrete match type; all fields are preserved.
 * @param matches the backend's ranked, version-tagged matches.
 * @param activeVersion the version the reader is currently viewing.
 * @param opts injected cap (defaults to 20).
 */
export function scopeSearchResults<T extends VersionTaggedMatch>(
  matches: readonly T[],
  activeVersion: VersionId,
  opts: ScopeSearchOptions = {},
): T[] {
  const limit = opts.limit ?? SEARCH_RESULT_CAP
  if (limit <= 0) {
    return []
  }

  const scoped: T[] = []
  for (const match of matches) {
    if (match.versionId !== activeVersion) {
      continue
    }
    scoped.push(match)
    if (scoped.length === limit) {
      break
    }
  }
  return scoped
}
