import { and, asc, eq, exists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../index'
import { account, user } from '../schema/auth'
import { branch } from '../schema/branch'
import { systemSetting } from '../schema/system'

const owner = alias(user, 'owner_user')
const manager = alias(user, 'manager_user')
const revisionKey = 'internal:invoice-staff-roster-revision'

function eligible(roleOwner: typeof owner | typeof manager, role: 'owner' | 'manager') {
  return and(
    eq(roleOwner.role, role),
    eq(roleOwner.emailVerified, true),
    sql`${roleOwner.banned} is distinct from true`,
    exists(
      db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, roleOwner.id), eq(account.providerId, 'google'))),
    ),
  )
}

export async function readInvoiceStaffRoster() {
  const epochMicros = sql`floor(extract(epoch from clock_timestamp()) * 1000000)::bigint`
  // The upsert locks this counter through the roster read. The second statement
  // takes a fresh READ COMMITTED snapshot after any earlier publisher commits.
  // The epoch floor also keeps revisions progressing after a normal data restore.
  const [[allocated], rows] = await db.batch([
    db
      .insert(systemSetting)
      .values({ key: revisionKey, value: sql`to_jsonb(${epochMicros})` })
      .onConflictDoUpdate({
        target: systemSetting.key,
        set: {
          value: sql`to_jsonb(greatest((${systemSetting.value} #>> '{}')::bigint + 1, ${epochMicros}))`,
          updatedAt: sql`clock_timestamp()`,
        },
      })
      .returning({ revision: systemSetting.value }),
    db
      .select({ branchId: branch.id, ownerEmail: owner.email, managerEmail: manager.email })
      .from(branch)
      .leftJoin(owner, and(eq(owner.id, branch.ownerUserId), eligible(owner, 'owner')))
      .leftJoin(manager, and(eq(manager.id, branch.managerUserId), eligible(manager, 'manager')))
      .orderBy(asc(branch.id))
      .limit(201),
  ])
  return { revision: allocated?.revision, rows }
}
