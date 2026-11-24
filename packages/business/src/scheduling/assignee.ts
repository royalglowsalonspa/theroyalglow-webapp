/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : scheduling/assignee
 * Scope        : Business Logic — who may do a booking, and who to suggest
 *
 * Description  : The candidates for a booking (membership-scheduling.md):
 *                SPA work is done by Therapists, salon work by Stylists, and
 *                the Manager or Receptionist may do either. Owners have no
 *                staff profile, so they are never candidates. When a
 *                booking is held up, the front desk is told who is free to
 *                take it instead (MS-08).
 *
 * Responsibilities :
 * - isCandidateFor(kind, designation) → boolean
 * - replacementSuggestions(people, { kind, exclude, limit }) → names
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure, no I/O)
 *
 * Dependencies : @rgss/types
 *
 * Notes        : A suggestion is not a lock: assigning someone rechecks
 *                leave, the branch and their other bookings in the write.
 ************************************************************/

import type { StaffDesignation } from '@rgss/types'

type Kind = 'salon' | 'spa'

/** Whether someone with `designation` may do a booking of `kind`. */
export function isCandidateFor(kind: Kind, designation: StaffDesignation): boolean {
  switch (designation) {
    case 'manager':
    case 'receptionist':
      return true
    case 'therapist':
      return kind === 'spa'
    case 'stylist':
      return kind === 'salon'
  }
}

/** A person as the availability read gives them. */
export type SuggestionCandidate = {
  id: string
  name: string
  designation: StaffDesignation
  /** How many of the booking's services they perform. */
  performs: number
  /** Why they can't take the slot, or null when they can. */
  busy: unknown | null
}

/**
 * Up to `limit` (default 3) names of people free for the slot who may do a
 * booking of `kind`, other than `exclude`: those who perform more of its
 * services first, then Therapists or Stylists before the Manager or
 * Receptionist, then by name.
 */
export function replacementSuggestions(
  people: readonly SuggestionCandidate[],
  options: { kind: Kind; exclude?: string | undefined; limit?: number },
): string[] {
  const limit = options.limit ?? 3
  const specialist = (p: SuggestionCandidate) =>
    p.designation === 'therapist' || p.designation === 'stylist' ? 1 : 0
  return people
    .filter(
      (p) =>
        p.busy === null && p.id !== options.exclude && isCandidateFor(options.kind, p.designation),
    )
    .sort(
      (a, b) =>
        b.performs - a.performs || specialist(b) - specialist(a) || a.name.localeCompare(b.name),
    )
    .slice(0, Math.max(0, limit))
    .map((p) => p.name)
}
