/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : schedule (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for staff scheduling and leave
 *                management operations.
 *
 * Responsibilities :
 * - Validate weekly schedule upserts (7-day entries per staff)
 * - Validate leave requests and approve/reject decisions
 *
 * Features / Functionality :
 * - upsertScheduleSchema — 7-day working/off schedule with times
 * - submitLeaveSchema — sick/casual/personal/other with date+reason
 * - leaveDecisionSchema — discriminated union approve | reject
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - Leave status machine: pending → approved | rejected
 * - One leave row per (staff, date) — DB unique constraint
 ************************************************************/
import { z } from 'zod'

export const upsertScheduleSchema = z.object({
  staffId: z.string().min(1),
  entries: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        isWorking: z.boolean(),
        startTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable(),
        endTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable(),
      }),
    )
    .length(7),
})
export type UpsertScheduleInput = z.infer<typeof upsertScheduleSchema>

export const LEAVE_TYPES = ['sick', 'casual', 'personal', 'other'] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

// Submit a leave request. One row per (staff, date) — matches the unique constraint.
export const submitLeaveSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
})
export type SubmitLeaveInput = z.infer<typeof submitLeaveSchema>

export const approveLeaveSchema = z.object({ action: z.literal('approve') })
export const rejectLeaveSchema = z.object({
  action: z.literal('reject'),
  rejectionReason: z.string().trim().min(1).max(500),
})

// A leave decision is either an approval or a rejection (which requires a reason).
export const leaveDecisionSchema = z.discriminatedUnion('action', [
  approveLeaveSchema,
  rejectLeaveSchema,
])
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>

// Leave approval state machine, mirroring the DB `leave_approval_status` enum
// which has exactly: pending | approved | rejected. There is NO 'withdrawn'
// value in the database — "withdraw" is a separate concern handled at the query
// layer (a staff member retracting their own pending request) and is therefore
// not part of this approval state machine.
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const
export type LeaveStatus = (typeof LEAVE_STATUSES)[number]
