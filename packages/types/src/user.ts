/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : user (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for people administration at a branch: the
 *                Users & Roles screen (admin.theroyalglow.in/users) changes a
 *                branch's Owner, Manager or Receptionist, and both it and the
 *                Staff page search for people by name, phone or email.
 *
 * Responsibilities :
 * - Define the canonical RBAC role list shared by client + server
 * - Validate a branch role change (multi-branch R1.4, R1.5, R2.4)
 * - Validate the person lookup term
 *
 * Features / Functionality :
 * - ASSIGNABLE_ROLES — the 6 RBAC roles, lowest → highest
 * - branchRoleChangeSchema — set Owner / Manager / Receptionist, or remove
 * - userListQuerySchema — { search? } lookup by name, phone, or email
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Who may make a change, and what it writes, is decided by
 *                @rgss/business planBranchRoleChange against current rows; it
 *                depends on the acting person, not on the input's shape.
 ************************************************************/
import { z } from 'zod'

// RBAC roles ordered lowest → highest privilege. Mirrors ROLE_LEVELS in the
// admin RBAC core and the `user.role` column values.
export const ASSIGNABLE_ROLES = [
  'customer',
  'staff',
  'receptionist',
  'manager',
  'owner',
  'developer',
] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

// Lookup term for the people searches (matches name, phone, or email). There
// is no directory: a blank or short term returns no accounts.
export const userListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
})
export type UserListQuery = z.infer<typeof userListQuerySchema>

/** Fewest characters a people search runs on (R1.11). */
export const PERSON_SEARCH_MIN_LENGTH = 3

const recordId = z.string().trim().min(1).max(64)

// Who holds a role at a branch, changed through Users & Roles (R1.5): the
// Developer sets the Owner; the branch's Owner or the Developer sets and
// removes its Manager and Receptionist. `branchId` is the branch the page was
// rendered for; the server rejects the change if the active branch has since
// changed (R2.4). Replacing a holder names the holder the actor saw, null for
// none, so a concurrent replacement is never overwritten unseen (R1.4).
export const branchRoleChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set_owner'),
    branchId: recordId,
    userId: recordId,
    expectedHolderId: recordId.nullable(),
  }),
  z.object({
    kind: z.literal('set_manager'),
    branchId: recordId,
    userId: recordId,
    expectedHolderId: recordId.nullable(),
  }),
  z.object({
    kind: z.literal('set_receptionist'),
    branchId: recordId,
    userId: recordId,
    expectedHolderId: recordId.nullable(),
  }),
  z.object({ kind: z.literal('remove'), branchId: recordId, userId: recordId }),
])
export type BranchRoleChangeInput = z.infer<typeof branchRoleChangeSchema>

/** The branch roles Users & Roles can give. */
export const BRANCH_HOLDER_ROLES = ['owner', 'manager', 'receptionist'] as const
export type BranchHolderRole = (typeof BRANCH_HOLDER_ROLES)[number]
