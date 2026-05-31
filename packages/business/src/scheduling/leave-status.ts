import { ERROR_CODES, conflict } from '@rgss/errors'
import type { LeaveStatus } from '@rgss/types'

// Leave approval state machine: pending → approved / rejected.
// 'approved' and 'rejected' are terminal — no outgoing transitions.
//
// Note: the DB `leave_approval_status` enum has only pending | approved |
// rejected — there is NO 'withdrawn' value. A staff member "withdrawing" a
// still-pending request is handled separately at the query layer (e.g. the row
// is removed or left pending), not as a transition in this approval map.
export const ALLOWED_LEAVE_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
}

// Guard a leave status transition. Any move not present in the allowed map is an
// illegal transition (BUSINESS_RULE_VIOLATION, 409). Same-status moves are not in
// the map and are therefore rejected.
export function assertLeaveTransition(from: LeaveStatus, to: LeaveStatus): void {
  if (!ALLOWED_LEAVE_TRANSITIONS[from].includes(to)) {
    throw conflict(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `Cannot move leave from '${from}' to '${to}'`,
    )
  }
}
