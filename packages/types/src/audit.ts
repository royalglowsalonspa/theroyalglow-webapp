/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : audit (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schema + types for the admin Logs (audit-log viewer) module.
 *                Validates the paginated, filterable query for GET /api/logs.
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Mirrors auditActionEnum in packages/db/src/schema/enums.ts.
 ************************************************************/
import { z } from 'zod'

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'status_change'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const auditLogQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  entity: z.string().trim().max(80).optional(),
  actorId: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>
