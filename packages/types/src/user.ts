/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : user (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for admin user/role administration. Used by the
 *                owner-facing role-assignment screen (admin.theroyalglow.in
 *                /users) to validate the assign-role request and the user
 *                directory search query.
 *
 * Responsibilities :
 * - Define the canonical RBAC role list shared by client + server
 * - Validate role-assignment input (email + target role)
 * - Validate the optional user-directory search query
 *
 * Features / Functionality :
 * - ASSIGNABLE_ROLES — the 6 RBAC roles, lowest → highest
 * - assignRoleSchema — { email, role } with email normalised to lowercase
 * - userListQuerySchema — { search? } for the directory filter
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - The actual privilege-ceiling check (an owner cannot grant a role above
 *   their own, nor edit a higher-privileged account) lives in the API route —
 *   it depends on the acting session and is not a pure input-shape concern.
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

// Assign a role to an existing user, identified by the email they signed in
// with. Email is trimmed + lowercased so it matches regardless of how the user
// typed it (Google emails are case-insensitive).
export const assignRoleSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(ASSIGNABLE_ROLES),
})
export type AssignRoleInput = z.infer<typeof assignRoleSchema>

// Optional free-text filter for the user directory (matches name OR email).
export const userListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
})
export type UserListQuery = z.infer<typeof userListQuerySchema>
