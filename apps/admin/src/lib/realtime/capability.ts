/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ably capability builder
 * Scope        : Realtime
 *
 * Description  : Pure builder for the admin Ably token capability map. Grants
 *                subscribe-only access to the channels of the branches the
 *                person may work at, and nothing else (multi-branch R2.6,
 *                design §3). No I/O — kept pure so it is property-testable.
 *
 * Responsibilities :
 * - Produce the capability map for a set of authorized branch ids
 * - Guarantee subscribe-only operations on those branches' channels only
 * - Never issue the legacy cross-branch wildcards
 *
 * Features / Functionality :
 * - buildAdminAblyCapability(branchIds) — channel → ['subscribe'] map
 * - adminChannelPatternsForBranch(branchId) — one branch's four patterns
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure (pure)
 *
 * Dependencies : ./channels
 *
 * Notes        : Ably matches a trailing `*` segment against the rest of the
 *                name, so `booking:{branchId}:*` covers that branch's
 *                bookings and no other branch's. A branch id that could
 *                change a pattern's meaning (`*`, `:` or anything outside the
 *                id alphabet) is skipped rather than granted.
 ************************************************************/

import { adminBookingsChannel, adminLeaveChannel } from './channels'

// Ably capability map: channel/namespace → allowed operations. The admin token
// is subscribe-only (read-only realtime); publishing stays on the server.
export type AblyCapability = Record<string, ['subscribe']>

// Branch ids are generated server-side (`branch_<slug>` or nanoid), so this
// alphabet is all a real id contains.
const SAFE_BRANCH_ID = /^[A-Za-z0-9_-]{1,64}$/

/** True when the id can appear inside a channel pattern without changing it. */
export function isChannelSafeBranchId(branchId: string): boolean {
  return SAFE_BRANCH_ID.test(branchId)
}

/** The four channel patterns one branch's staff may subscribe to. */
export function adminChannelPatternsForBranch(branchId: string): string[] {
  return [
    adminBookingsChannel(branchId),
    `admin:schedule:${branchId}:*`,
    adminLeaveChannel(branchId),
    `booking:${branchId}:*`,
  ]
}

/**
 * The subscribe-only capability for someone authorized at `branchIds`. An empty
 * list yields an empty map, which the caller must not issue.
 */
export function buildAdminAblyCapability(branchIds: readonly string[]): AblyCapability {
  const capability: AblyCapability = {}
  for (const branchId of branchIds) {
    if (!isChannelSafeBranchId(branchId)) {
      continue
    }
    for (const channel of adminChannelPatternsForBranch(branchId)) {
      capability[channel] = ['subscribe']
    }
  }
  return capability
}
