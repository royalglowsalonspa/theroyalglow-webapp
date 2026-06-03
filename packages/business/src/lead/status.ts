/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : status (lead)
 * Scope        : Business Logic — Lead Pipeline
 *
 * Description  : Lead status state machine with allowed transitions
 *                and guard function for validation.
 *
 * Responsibilities :
 * - Define allowed lead status transitions
 * - Guard illegal transitions with AppError
 * - Enforce mandatory reason for 'lost' status
 *
 * Features / Functionality :
 * - ALLOWED_LEAD_TRANSITIONS map
 * - assertLeadTransition(from, to, reason) — throws on invalid move
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Terminal statuses: won, lost (no outgoing moves)
 ************************************************************/
import { ERROR_CODES, badRequest, conflict } from '@rgss/errors'
import type { LeadStatus } from '@rgss/types'

// Lead state machine: new → contacted → follow_up → booked → won/lost.
// A lead may also convert straight to 'booked' from 'new', and any non-terminal
// status may jump to 'lost'. 'won' and 'lost' are terminal — no outgoing moves.
export const ALLOWED_LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['contacted', 'lost', 'booked'],
  contacted: ['follow_up', 'booked', 'lost'],
  follow_up: ['booked', 'lost'],
  booked: ['won', 'lost'],
  won: [],
  lost: [],
}

// Guard a lead status transition. Marking a lead 'lost' requires a non-empty
// reason (VALIDATION_ERROR, 400). Any move not present in the allowed map is an
// illegal transition (BUSINESS_RULE_VIOLATION, 409). Same-status moves are not
// in the map and are therefore rejected.
export function assertLeadTransition(from: LeadStatus, to: LeadStatus, reason?: string): void {
  if (to === 'lost' && (reason === undefined || reason.trim().length === 0)) {
    throw badRequest('A reason is required when marking a lead as lost')
  }

  if (!ALLOWED_LEAD_TRANSITIONS[from].includes(to)) {
    throw conflict(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `Cannot move a lead from '${from}' to '${to}'`,
    )
  }
}
