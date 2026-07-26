/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : waitlist state-machine
 * Scope        : API — Admin Waitlist
 *
 * Description  : Pure state-machine guard for waitlist status transitions.
 *                Encodes the legal moves and throws a 409 conflict on an
 *                illegal transition.
 *
 * Responsibilities :
 * - Define the allowed waitlist status transitions
 * - Expose a pure predicate (isWaitlistTransitionAllowed)
 * - Expose an assertion that throws AppError(409) on an illegal move
 *
 * Features / Functionality :
 * - waiting   → notified | cancelled | expired
 * - notified  → booked | cancelled | expired
 * - booked / expired / cancelled are terminal (no further moves)
 *
 * Tech Stack   : TypeScript
 * Layer        : API (pure helper, no I/O)
 *
 * Dependencies : @rgss/errors, @rgss/types
 *
 * Notes        : No I/O — kept pure so the transition rules are trivially
 *                testable in isolation from the route handler.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import type { WaitlistStatus } from '@rgss/types'

// Adjacency map of legal moves. Terminal states map to an empty list. A repeat
// of the same status is intentionally NOT allowed (no self-loops).
const ALLOWED_TRANSITIONS: Record<WaitlistStatus, readonly WaitlistStatus[]> = {
  waiting: ['notified', 'cancelled', 'expired'],
  notified: ['booked', 'cancelled', 'expired'],
  booked: [],
  expired: [],
  cancelled: [],
}

// Pure predicate: is moving from `from` to `to` a legal waitlist transition?
export function isWaitlistTransitionAllowed(from: WaitlistStatus, to: WaitlistStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

// Assert the transition is legal, else throw a 409 conflict naming both states.
export function assertWaitlistTransition(from: WaitlistStatus, to: WaitlistStatus): void {
  if (!isWaitlistTransitionAllowed(from, to)) {
    throw conflict(ERROR_CODES.CONFLICT, `Cannot move a waitlist entry from '${from}' to '${to}'.`)
  }
}
