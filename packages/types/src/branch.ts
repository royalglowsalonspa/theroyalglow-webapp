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

// Mirrors branchStatusEnum in packages/db/src/schema/enums.ts.
export const BRANCH_STATUSES = [
  'operational',
  'temporarily_closed',
  'opens_soon',
  'shutdown',
] as const
export type BranchStatusValue = (typeof BRANCH_STATUSES)[number]

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
export const branchCreateSchema = z.object({
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
})
export type BranchCreateInput = z.infer<typeof branchCreateSchema>

export const branchUpdateSchema = branchCreateSchema.partial()
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>
