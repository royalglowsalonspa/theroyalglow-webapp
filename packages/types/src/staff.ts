/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : staff (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + types for admin Staff management — editing a
 *                staff member's staff_profile fields and replacing the set of
 *                services they are able to perform (staff_service mapping that
 *                drives booking availability).
 *
 * Responsibilities :
 * - Validate the staff_profile create input (link an existing user by email)
 * - Validate the staff_profile partial update (designation, phone, bio,
 *   specialization, active flag, hire date)
 * - Validate the service-capability replacement payload ({ serviceIds })
 *
 * Features / Functionality :
 * - staffCreateSchema — link an existing account (by email) as a staff member
 * - staffUpdateSchema — every field optional (PATCH semantics)
 * - staffServicesSchema — replaces capabilities wholesale
 * - STAFF_DESIGNATIONS literal union (mirrors the DB enum)
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Only columns that actually exist on staff_profile are editable
 *                here — there is no displayOrder column on staff_profile, so it
 *                is intentionally absent. Staff are deactivated (isActive=false),
 *                never hard-deleted.
 ************************************************************/
import { z } from 'zod'

// Mirrors staffDesignationEnum in packages/db/src/schema/enums.ts exactly.
export const STAFF_DESIGNATIONS = ['receptionist', 'stylist', 'therapist', 'manager'] as const
export type StaffDesignation = (typeof STAFF_DESIGNATIONS)[number]

// Create a staff_profile by linking an existing user account (identified by the
// email they signed in with). The user must already exist — the API returns a
// clear 404 ("ask them to sign in first") otherwise. Email is trimmed +
// lowercased so it matches regardless of how it was typed (Google emails are
// case-insensitive). Optional text fields accept null to leave them blank.
export const staffCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  designation: z.enum(STAFF_DESIGNATIONS),
  phone: z.string().trim().max(20).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  specialization: z.string().trim().max(200).nullable().optional(),
  hireDate: z.coerce.date().nullable().optional(),
})
export type StaffCreateInput = z.infer<typeof staffCreateSchema>

// Partial update of an existing staff_profile. Every field is optional so the
// admin can patch one column at a time; nullable text fields accept null to
// clear them. `hireDate` is coerced from an ISO string in the request body.
export const staffProfileUpdateSchema = z.object({
  designation: z.enum(STAFF_DESIGNATIONS).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  specialization: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
  hireDate: z.coerce.date().nullable().optional(),
})
export type StaffProfileUpdateInput = z.infer<typeof staffProfileUpdateSchema>

// Replace a staff member's service capabilities wholesale. An empty array
// clears all capabilities. IDs are de-duplicated server-side.
export const staffServiceAssignmentSchema = z.object({
  serviceIds: z.array(z.string().min(1)).max(500),
})
export type StaffServiceAssignmentInput = z.infer<typeof staffServiceAssignmentSchema>

/* ── Canonical spec aliases ─────────────────────────────────────────────── *
 * The Staff management spec refers to the update and service-replacement       *
 * schemas by these shorter names. The verbose names above remain exported for  *
 * existing consumers (the [id] and [id]/services routes); these aliases are the *
 * same Zod objects, so both names validate identically.                        *
 * ------------------------------------------------------------------------- */
export const staffUpdateSchema = staffProfileUpdateSchema
export type StaffUpdateInput = StaffProfileUpdateInput

export const staffServicesSchema = staffServiceAssignmentSchema
export type StaffServicesInput = StaffServiceAssignmentInput
