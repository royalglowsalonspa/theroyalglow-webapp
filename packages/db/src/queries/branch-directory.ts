/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch-directory
 * Scope        : Data Access — the branches customers can visit
 *                (multi-branch R7.2, customer-flows.md)
 *
 * Description  : Every branch that isn't shut down, with what the website
 *                shows about it: contact details, the business hours of its
 *                current settings revision, and its closures in a window.
 *
 * Responsibilities :
 * - getBranchDirectory(fromISO, toISO) → the branches in display order
 *
 * Features / Functionality :
 * - Three reads at once: branches, current revisions, closures
 * - A day closed for the branch and for every branch is listed once, named
 *   by the branch's own closure (as getClosureOn names it)
 * - Hours that can't be read come back null, never as defaults
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/*
 *
 * Notes        : Public data only: no owner, manager, GSTIN or legal name.
 ************************************************************/

import { type BusinessHours, businessHoursSchema } from '@rgss/types'
import { and, asc, desc, gte, lte, ne, sql } from 'drizzle-orm'
import { db } from '../index'
import { branch } from '../schema/branch'
import { branchSetting } from '../schema/branch-setting'
import { holiday } from '../schema/schedule'

export type BranchDirectoryClosure = { date: string; name: string }

export type BranchDirectoryEntry = {
  id: string
  code: string
  name: string
  status: (typeof branch.$inferSelect)['status']
  isPrimary: boolean
  temporaryCloseReason: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  pincode: string
  phone: string
  email: string | null
  googleMapsUrl: string | null
  /** The current revision's hours; null when they can't be read. */
  businessHours: BusinessHours | null
  /** Closures from `fromISO` to `toISO`, by date, one per date. */
  closures: BranchDirectoryClosure[]
}

function readHours(value: unknown): BusinessHours | null {
  const parsed = businessHoursSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * The branches customers can see (every status but `shutdown`), in display
 * order, with their current hours and their closures from `fromISO` to
 * `toISO` (calendar dates, inclusive).
 */
export async function getBranchDirectory(
  fromISO: string,
  toISO: string,
): Promise<BranchDirectoryEntry[]> {
  const [branches, revisions, closures] = await Promise.all([
    db
      .select({
        id: branch.id,
        code: branch.code,
        name: branch.name,
        status: branch.status,
        isPrimary: branch.isPrimary,
        temporaryCloseReason: branch.temporaryCloseReason,
        addressLine1: branch.addressLine1,
        addressLine2: branch.addressLine2,
        city: branch.city,
        state: branch.state,
        pincode: branch.pincode,
        phone: branch.phone,
        email: branch.email,
        googleMapsUrl: branch.googleMapsUrl,
      })
      .from(branch)
      .where(ne(branch.status, 'shutdown'))
      .orderBy(asc(branch.displayOrder), asc(branch.name)),
    // Each branch's current revision.
    db
      .selectDistinctOn([branchSetting.branchId], {
        branchId: branchSetting.branchId,
        businessHours: branchSetting.businessHours,
      })
      .from(branchSetting)
      .orderBy(branchSetting.branchId, desc(branchSetting.revision)),
    db
      .select({ branchId: holiday.branchId, date: holiday.date, name: holiday.name })
      .from(holiday)
      .where(and(gte(holiday.date, fromISO), lte(holiday.date, toISO)))
      // On a date closed both ways, the branch's own closure comes first.
      .orderBy(asc(holiday.date), sql`${holiday.branchId} is null`, asc(holiday.id)),
  ])

  const hoursOf = new Map(revisions.map((row) => [row.branchId, readHours(row.businessHours)]))

  return branches.map((row) => {
    const seen = new Set<string>()
    const own: BranchDirectoryClosure[] = []
    for (const closure of closures) {
      if ((closure.branchId === null || closure.branchId === row.id) && !seen.has(closure.date)) {
        seen.add(closure.date)
        own.push({ date: closure.date, name: closure.name })
      }
    }
    return { ...row, businessHours: hoursOf.get(row.id) ?? null, closures: own }
  })
}
