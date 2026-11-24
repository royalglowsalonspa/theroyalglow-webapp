/************************************************************
 * Module Name  : realtime/token-lifetime (admin)
 * Scope        : Realtime — how long a live-update token can outlive a change
 *
 * Description  : Pure constants shared by the token issuer, the revocation
 *                worker and the screens that explain revocation (R2.6). No
 *                imports, so client components may use them.
 ************************************************************/

/** An admin token lives 10 minutes (design §3); the client then asks again. */
export const TOKEN_TTL_MS = 10 * 60 * 1000

/** Ably accepts a signed TokenRequest for 2 minutes; one more for clock skew. */
export const TOKEN_REQUEST_WINDOW_MS = 3 * 60 * 1000

/** After this, no token issued with the old access can still be valid. */
export const OLD_TOKENS_GONE_AFTER_MS = TOKEN_TTL_MS + TOKEN_REQUEST_WINDOW_MS

/** What a role change reports about the signed-out people's live updates. */
export type LiveUpdatesStatus = 'stopped' | 'retrying' | 'not_configured' | 'none'

/** What to tell the person who made a role change, or null when nothing needs saying. */
export function liveUpdatesNotice(status: unknown): string | null {
  if (status !== 'retrying') {
    return null
  }
  const minutes = Math.ceil(OLD_TOKENS_GONE_AFTER_MS / 60_000)
  return `Their live updates couldn't be cut off yet. We keep trying, and they stop within ${minutes} minutes regardless.`
}
