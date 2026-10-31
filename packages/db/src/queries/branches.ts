/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branches
 * Scope        : Data Access — Branches
 *
 * Description  : Query functions for physical salon/spa branches: list all,
 *                fetch by id, create (with server-generated unique code +
 *                sequential number), and patch (incl. status changes). Designed
 *                multi-branch-ready — no single branch is hardcoded.
 *
 * Responsibilities :
 * - List every branch ordered for the admin management UI
 * - List the branches customers may see (booking dialog picker)
 * - Fetch a single branch by id
 * - Create a branch, generating a unique `code` and the next `number`
 * - Patch a branch with conditional assignment (exactOptionalPropertyTypes)
 *
 * Features / Functionality :
 * - Unique branch code derived from name (mirrors the services slug helper)
 * - Sequential branch number = max(number) + 1
 * - Branches are never hard-deleted — status drives lifecycle
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, nanoid, ../index, ../schema/branch, @rgss/types
 *
 * Notes        : `code` + `number` are generated server-side and immutable.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import type { BranchCreateInput, BranchUpdateInput } from '@rgss/types'
import { asc, eq, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'
import { findDriverError, isConstraintViolation, isGuardAbort, SQLSTATE } from './driver-errors'

// All branches (every status), ordered for the admin list.
export async function getBranches() {
  return db.select().from(branch).orderBy(asc(branch.displayOrder), asc(branch.name))
}

export async function getBranchById(id: string) {
  const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1)
  return rows[0] ?? null
}

// Branches customers may see in the booking dialog: every branch except a
// `shutdown` one, in display order. Only the fields the picker shows, plus
// `isPrimary` for choosing the default branch and `code` for ad links that
// name a branch; no address, phone or geo.
export async function getPublicBranches() {
  return db
    .select({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      city: branch.city,
      status: branch.status,
      isPrimary: branch.isPrimary,
    })
    .from(branch)
    .where(ne(branch.status, 'shutdown'))
    .orderBy(asc(branch.displayOrder), asc(branch.name))
}

// Derive a short upper-case alphanumeric code from a branch name.
function deriveCode(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
  return base.slice(0, 6) || 'BR'
}

// Code uniqueness for the `branch` table (mirrors the services slug helper).
async function uniqueBranchCode(name: string): Promise<string> {
  const base = deriveCode(name)
  const existing = await db
    .select({ code: branch.code })
    .from(branch)
    .where(eq(branch.code, base))
    .limit(1)
  return existing.length === 0 ? base : `${base}-${nanoid(4).toUpperCase()}`
}

const INVOICE_PREFIX = /^[A-Z][A-Z0-9]{0,3}$/

/**
 * A new branch's invoice prefix (R6.2): the one given, else its code when
 * that fits (1–4 characters), else "B" + its number in base 36, the same
 * default migration 0017 uses. Unique because codes and numbers are.
 */
export function defaultInvoicePrefix(code: string, number: number): string {
  if (INVOICE_PREFIX.test(code)) {
    return code
  }
  return `B${number.toString(36).toUpperCase()}`
}

// Next sequential branch number (1-based).
async function nextBranchNumber(): Promise<number> {
  const rows = await db
    .select({ max: sql<number>`coalesce(max(${branch.number}), 0)::int` })
    .from(branch)
  return (rows[0]?.max ?? 0) + 1
}

export type CreateBranchResult =
  | { ok: true; branch: typeof branch.$inferSelect }
  | { ok: false; reason: 'owner_unavailable' }

// Create a branch with its Owner, in one transaction (R1.1, R1.2). `code` and
// `number` are generated server-side. The Owner must be an Owner already, or
// a Customer with no active staff profile, who then becomes the Owner: the
// guarded role update aborts the whole batch otherwise. The Owner key is
// deferred to commit so the branch can be written before the role.
export async function createBranch(data: BranchCreateInput): Promise<CreateBranchResult> {
  const code = await uniqueBranchCode(data.name)
  const number = await nextBranchNumber()
  const id = nanoid()

  const insertBranch = db
    .insert(branch)
    .values({
      id,
      number,
      code,
      ownerUserId: data.ownerUserId,
      name: data.name,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 ?? null,
      city: data.city ?? 'Bengaluru',
      state: data.state ?? 'Karnataka',
      pincode: data.pincode,
      phone: data.phone,
      email: data.email ?? null,
      googleMapsUrl: data.googleMapsUrl ?? null,
      googleMapsPlaceId: data.googleMapsPlaceId ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      status: data.status ?? 'operational',
      openingDate: data.openingDate ?? null,
      closingDate: data.closingDate ?? null,
      temporaryCloseReason: data.temporaryCloseReason ?? null,
      isPrimary: data.isPrimary ?? false,
      displayOrder: data.displayOrder ?? 0,
      legalName: data.legalName?.trim() ? data.legalName.trim() : null,
      gstin: data.gstin ? data.gstin : null,
      invoicePrefix: data.invoicePrefix ?? defaultInvoicePrefix(code, number),
    })
    .returning()

  // Owner already, or a Customer free of any performing role, who becomes one.
  const promoteOwner = db.execute(sql`with changed as (
      update ${user} set ${sql.identifier(user.role.name)} = 'owner',
        ${sql.identifier(user.updatedAt.name)} = now()
      where ${user.id} = ${data.ownerUserId}
        and (${user.role} = 'owner'
          or (coalesce(${user.role}, 'customer') = 'customer'
            and not exists (select 1 from ${staffProfile}
              where ${staffProfile.userId} = ${data.ownerUserId} and ${staffProfile.isActive})))
      returning 1)
    select 1 / count(*)::int as ok from changed`)

  try {
    const [, rows] = await db.batch([
      db.execute(sql`set constraints branch_owner_fk deferred`),
      insertBranch,
      promoteOwner,
    ])
    const created = rows[0]
    if (!created) {
      throw new Error('Failed to create branch.')
    }
    return { ok: true, branch: created }
  } catch (error) {
    if (isGuardAbort(error)) {
      return { ok: false, reason: 'owner_unavailable' }
    }
    throw error
  }
}

// Patch a branch. Only provided keys are written; `updatedAt` auto-bumps.
// `code` and `number` are immutable and not patchable. Shutting a branch
// down goes through shutDownBranch (branch-shutdown.ts) instead.
export async function updateBranch(id: string, patch: BranchUpdateInput) {
  const values = branchUpdateValues(patch)
  if (Object.keys(values).length === 0) {
    return getBranchById(id)
  }
  try {
    const [updated] = await db.update(branch).set(values).where(eq(branch.id, id)).returning()
    return updated ?? null
  } catch (error) {
    // The prefix is fixed once the branch has numbered an invoice (0018
    // trigger), and no two branches share one.
    if (isConstraintViolation(error, SQLSTATE.uniqueViolation, ['branch_invoice_prefix_unique'])) {
      throw conflict(ERROR_CODES.CONFLICT, 'Another branch already uses that invoice prefix.')
    }
    if (findDriverError(error, [SQLSTATE.checkViolation])?.message?.toString().includes('prefix')) {
      throw conflict(
        ERROR_CODES.CONFLICT,
        'This branch has issued invoices, so its invoice prefix can’t change.',
      )
    }
    throw error
  }
}

/** The columns a patch writes: only the keys it provides. */
export function branchUpdateValues(patch: BranchUpdateInput): Partial<typeof branch.$inferInsert> {
  const values: Partial<typeof branch.$inferInsert> = {}
  if (patch.name !== undefined) {
    values.name = patch.name
  }
  if (patch.addressLine1 !== undefined) {
    values.addressLine1 = patch.addressLine1
  }
  if (patch.addressLine2 !== undefined) {
    values.addressLine2 = patch.addressLine2 ?? null
  }
  if (patch.city !== undefined) {
    values.city = patch.city
  }
  if (patch.state !== undefined) {
    values.state = patch.state
  }
  if (patch.pincode !== undefined) {
    values.pincode = patch.pincode
  }
  if (patch.phone !== undefined) {
    values.phone = patch.phone
  }
  if (patch.email !== undefined) {
    values.email = patch.email ?? null
  }
  if (patch.googleMapsUrl !== undefined) {
    values.googleMapsUrl = patch.googleMapsUrl ?? null
  }
  if (patch.googleMapsPlaceId !== undefined) {
    values.googleMapsPlaceId = patch.googleMapsPlaceId ?? null
  }
  if (patch.latitude !== undefined) {
    values.latitude = patch.latitude ?? null
  }
  if (patch.longitude !== undefined) {
    values.longitude = patch.longitude ?? null
  }
  if (patch.status !== undefined) {
    values.status = patch.status
  }
  if (patch.openingDate !== undefined) {
    values.openingDate = patch.openingDate ?? null
  }
  if (patch.closingDate !== undefined) {
    values.closingDate = patch.closingDate ?? null
  }
  if (patch.temporaryCloseReason !== undefined) {
    values.temporaryCloseReason = patch.temporaryCloseReason ?? null
  }
  if (patch.isPrimary !== undefined) {
    values.isPrimary = patch.isPrimary
  }
  if (patch.displayOrder !== undefined) {
    values.displayOrder = patch.displayOrder
  }
  if (patch.legalName !== undefined) {
    values.legalName = patch.legalName.trim() ? patch.legalName.trim() : null
  }
  if (patch.gstin !== undefined) {
    values.gstin = patch.gstin ? patch.gstin : null
  }
  if (patch.invoicePrefix !== undefined) {
    values.invoicePrefix = patch.invoicePrefix
  }
  return values
}
