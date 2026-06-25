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

import type { BranchCreateInput, BranchUpdateInput } from '@rgss/types'
import { asc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { branch } from '../schema/branch'

// All branches (every status), ordered for the admin list.
export async function getBranches() {
  return db.select().from(branch).orderBy(asc(branch.displayOrder), asc(branch.name))
}

export async function getBranchById(id: string) {
  const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1)
  return rows[0] ?? null
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

// Next sequential branch number (1-based).
async function nextBranchNumber(): Promise<number> {
  const rows = await db
    .select({ max: sql<number>`coalesce(max(${branch.number}), 0)::int` })
    .from(branch)
  return (rows[0]?.max ?? 0) + 1
}

// Create a branch. `code` + `number` are generated server-side.
export async function createBranch(data: BranchCreateInput) {
  const code = await uniqueBranchCode(data.name)
  const number = await nextBranchNumber()
  const [created] = await db
    .insert(branch)
    .values({
      number,
      code,
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
    })
    .returning()
  return created
}

// Patch a branch. Only provided keys are written; `updatedAt` auto-bumps.
// `code` and `number` are immutable and not patchable.
export async function updateBranch(id: string, patch: BranchUpdateInput) {
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

  if (Object.keys(values).length === 0) {
    return getBranchById(id)
  }
  const [updated] = await db.update(branch).set(values).where(eq(branch.id, id)).returning()
  return updated ?? null
}
