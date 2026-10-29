/************************************************************
 * Module Name  : membership/session-request
 * Scope        : Business Logic — Membership
 *
 * Description  : Decides whether a retried "record session" request asks for
 *                the same session that an earlier request with the same
 *                idempotency key already recorded.
 *
 * Responsibilities :
 * - isSameSessionRequest(requested, recorded) → boolean
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure, no I/O)
 *
 * Notes        :
 * - Lines compare as a multiset, so a reordered retry still matches; a
 *   changed service, duration or staff member does not.
 * - A missing staff member and an explicit null are the same thing.
 ************************************************************/

export type SessionLine = {
  serviceId: string
  durationMinutes: number
  staffId?: string | null | undefined
}

function lineKey(line: SessionLine): string {
  return `${line.serviceId}\u0000${line.durationMinutes}\u0000${line.staffId ?? ''}`
}

// True when both describe the same service lines: the same services,
// durations and assigned staff, in any order.
export function isSameSessionRequest(
  requested: readonly SessionLine[],
  recorded: readonly SessionLine[],
): boolean {
  if (requested.length !== recorded.length) {
    return false
  }
  const a = requested.map(lineKey).sort()
  const b = recorded.map(lineKey).sort()
  return a.every((key, index) => key === b[index])
}
