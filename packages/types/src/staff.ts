/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : staff (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + types for the Staff page at a branch: adding,
 *                editing and removing Stylists and Therapists, and replacing
 *                the services a staff member performs (the staff_service
 *                mapping that drives booking availability).
 *
 * Responsibilities :
 * - Validate Add staff (a person from the search, Stylist or Therapist)
 * - Validate the partial profile update (title, phone, bio, specialization,
 *   hire date)
 * - Validate Remove staff
 * - Validate the service-capability replacement payload ({ serviceIds })
 *
 * Features / Functionality :
 * - staffAddSchema / staffRemoveSchema — carry the rendered branch (R2.4)
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
 *                here. Removed staff keep their profile, inactive, so bookings
 *                and invoices keep their staff; nothing is hard-deleted.
 ************************************************************/
import { z } from 'zod'

// Mirrors staffDesignationEnum in packages/db/src/schema/enums.ts exactly.
export const STAFF_DESIGNATIONS = ['receptionist', 'stylist', 'therapist', 'manager'] as const
export type StaffDesignation = (typeof STAFF_DESIGNATIONS)[number]

// The titles of the Staff role: the people who perform services. Managers and
// Receptionists carry the title of their own role (R1.11).
export const SERVICE_DESIGNATIONS = ['stylist', 'therapist'] as const
export type ServiceDesignation = (typeof SERVICE_DESIGNATIONS)[number]

const recordId = z.string().trim().min(1).max(64)

/** Longest specialization a profile stores (R1.6). */
export const SPECIALIZATION_MAX_LENGTH = 200

const specialization = z.string().trim().max(SPECIALIZATION_MAX_LENGTH).nullable().optional()

// Add an existing account, found with the people search, as a Stylist or
// Therapist at the branch the page was rendered for (R1.11). Role, profile,
// branch and audit entry are written in one transaction; re-adding someone
// who was removed reactivates their earlier profile.
export const staffAddSchema = z.object({
  branchId: recordId,
  userId: recordId,
  designation: z.enum(SERVICE_DESIGNATIONS),
  specialization,
})
export type StaffAddInput = z.infer<typeof staffAddSchema>

// Edit a staff member of the branch the page was rendered for. Every field is
// optional so one column can change at a time; nullable text fields accept
// null to clear them. Only a Stylist or Therapist changes title, between those
// two. Removal replaces the old active toggle (R1.5), so there is none here.
export const staffProfileUpdateSchema = z.object({
  branchId: recordId,
  designation: z.enum(SERVICE_DESIGNATIONS).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  specialization,
  hireDate: z.coerce.date().nullable().optional(),
})
export type StaffProfileUpdateInput = z.infer<typeof staffProfileUpdateSchema>

// Remove a Stylist or Therapist from the branch the page was rendered for:
// they return to Customer and are signed out; history is kept (R1.11).
export const staffRemoveSchema = z.object({ branchId: recordId })
export type StaffRemoveInput = z.infer<typeof staffRemoveSchema>

// Replace a staff member's service capabilities wholesale. An empty array
// clears all capabilities. IDs are de-duplicated server-side. `branchId` is
// the branch the page was rendered for (R2.4).
export const staffServiceAssignmentSchema = z.object({
  branchId: recordId,
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
