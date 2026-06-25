/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : audit
 * Scope        : Data Access — Audit log viewer (admin)
 *
 * Description  : Paginated, filterable read over the audit_log table for the
 *                admin Logs viewer. JOIN actor (user) name/email. Never writes.
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/system
 *
 * Notes        : Indexed on (entityType, entityId) and (actorId, createdAt).
 ************************************************************/

import type { AuditLogQuery } from '@rgss/types'
import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { auditLog } from '../schema/system'

export async function getAuditLogs(query: AuditLogQuery) {
  const conditions = []
  if (query.action) {
    conditions.push(eq(auditLog.action, query.action))
  }
  if (query.entity) {
    conditions.push(ilike(auditLog.entityType, `%${query.entity}%`))
  }
  if (query.actorId) {
    conditions.push(eq(auditLog.actorId, query.actorId))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize

  const rows = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: user.name,
      actorEmail: user.email,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      oldValues: auditLog.oldValues,
      newValues: auditLog.newValues,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(user, eq(auditLog.actorId, user.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(query.pageSize)
    .offset(offset)

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(where)

  return { rows, totalCount: countResult[0]?.count ?? 0 }
}
