/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + types for admin Branch management — physical
 *                salon/spa locations with address, contact, geo-coordinates and
 *                operational status. Designed multi-branch-ready: any number of
 *                branches, each addressable by id.
 *
 * Responsibilities :
 * - Validate branch create (name, address, pincode, phone, email, geo, status)
 * - Validate branch update (partial patch incl. status changes)
 * - Mirror branchStatusEnum values as a literal union (BRANCH_STATUSES)
 *
 * Features / Functionality :
 * - branchCreateSchema / branchUpdateSchema
 * - BRANCH_STATUSES + BranchStatusValue
 * - India-aware validation: 6-digit pincode, phone, email, lat/lng decimals
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : The branch `code` and `number` are generated server-side
 *                (code mirrors the services slug-uniqueness helper). Money is
 *                not handled here. Dates are coerced to Date objects.
 ************************************************************/
import { z } from 'zod'
import { gstinSchema } from './gstin'

// Mirrors branchStatusEnum in packages/db/src/schema/enums.ts.
export const BRANCH_STATUSES = [
  'operational',
  'temporarily_closed',
  'opens_soon',
  'shutdown',
] as const
export type BranchStatusValue = (typeof BRANCH_STATUSES)[number]

/** The start of a branch's invoice numbers: RS in RS/2627/000123 (R6.2). */
export const invoicePrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{0,3}$/, 'Use 1 to 4 letters or digits, starting with a letter.')

// India-aware field validators implied by the schema columns.
const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode.')
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{10,18}$/, 'Enter a valid phone number.')
const latitudeSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,3}(\.\d{1,7})?$/, 'Enter a valid latitude.')
const longitudeSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,3}(\.\d{1,7})?$/, 'Enter a valid longitude.')

// ── Branch ──────────────────────────────────────────────────────────────
// The editable details of a branch.
const branchFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  state: z.string().trim().min(1).max(80).optional(),
  pincode: pincodeSchema,
  phone: phoneSchema,
  email: z.string().trim().email().max(160).optional(),
  googleMapsUrl: z.string().trim().url().max(500).optional(),
  googleMapsPlaceId: z.string().trim().max(200).optional(),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  status: z.enum(BRANCH_STATUSES).optional(),
  openingDate: z.coerce.date().optional(),
  closingDate: z.coerce.date().optional(),
  temporaryCloseReason: z.string().trim().max(300).optional(),
  isPrimary: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).max(9999).optional(),
  // The issuer on the branch's invoices (multi-branch R6.1). Required before
  // live invoicing (TX-08); an empty value clears it.
  legalName: z.string().trim().max(160).optional(),
  gstin: z.union([gstinSchema, z.literal('')]).optional(),
  // 1–4 capitals or digits starting with a letter: RS in RS/2627/000123.
  // Fixed once the branch has issued an invoice.
  invoicePrefix: invoicePrefixSchema.optional(),
})

// A new branch names its Owner (multi-branch R1.2): an existing Owner, or a
// Customer who becomes one. Only the Developer creates branches (R1.1).
export const branchCreateSchema = branchFieldsSchema.extend({
  ownerUserId: z.string().trim().min(1).max(64),
})
export type BranchCreateInput = z.infer<typeof branchCreateSchema>

// Editing never changes the Owner: that is the Owner handover in Users & Roles.
export const branchUpdateSchema = branchFieldsSchema.partial()
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>

// The admin branch switcher's choice (R2.1). A preference only: the server
// uses it only for a branch the person can access.
export const activeBranchSchema = z.object({
  branchId: z.string().trim().min(1).max(64),
})
export type ActiveBranchInput = z.infer<typeof activeBranchSchema>

// The branch an admin form was rendered for (R2.4). Every branch-owned write
// sends it, so a tab left open across a branch switch is refused (409) instead
// of writing into the newly selected branch. It grants no access by itself.
export const renderedBranchIdSchema = z.string().trim().min(1).max(64)

// ── Public branch list (customer booking dialog) ────────────────────────
// What GET /api/branches returns for the booking dialog's branch picker.
// Address, contact and geo fields are deliberately left out.
export type PublicBranch = {
  id: string
  name: string
  city: string
  status: BranchStatusValue
  /** True only for an operational branch; the picker disables the others. */
  acceptingBookings: boolean
}

export type PublicBranchList = {
  /** Every branch that is not shut down, in display order. */
  branches: PublicBranch[]
  /**
   * The branch the dialog preselects, and the one GET /api/availability uses
   * when a request names no branch. Null when no branch is taking bookings.
   */
  defaultBranchId: string | null
}
