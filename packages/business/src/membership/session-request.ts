/************************************************************
 * Module Name  : membership/session-request
 * Scope        : Business Logic — Membership
 *
 * Description  : Decides whether a retried "record session" request asks for
 *                the same session that an earlier request with the same
 *                idempotency key already recorded.
 *
 * Responsibilities :
 * - sessionAssignee(staffId, lines) → the one person who does the session
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

import { badRequest } from '@rgss/errors'

export type SessionLine = {
  serviceId: string
  durationMinutes: number
  staffId?: string | null | undefined
}

function lineKey(line: SessionLine): string {
  return `${line.serviceId}\u0000${line.durationMinutes}\u0000${line.staffId ?? ''}`
}

// The one person who does a session (membership-scheduling.md, 0028): the
// form's choice, else the one every line names. Throws 400 when the lines
// and the form name different people, or nobody is named: a session starts
// when it is recorded, and starting needs its assignee.
export function sessionAssignee(
  staffId: string | undefined,
  lines: readonly Pick<SessionLine, 'staffId'>[],
): string {
  const named = new Set(lines.flatMap((line) => (line.staffId ? [line.staffId] : [])))
  if (staffId) {
    named.add(staffId)
  }
  if (named.size > 1) {
    throw badRequest('One person does the whole session. Choose one person for all of it.')
  }
  const [only] = named
  if (!only) {
    throw badRequest('Choose who is doing this session.')
  }
  return only
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
