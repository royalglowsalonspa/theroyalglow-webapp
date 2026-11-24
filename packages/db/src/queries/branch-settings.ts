/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-10-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch-settings
 * Scope        : Data Access — branch booking settings (multi-branch R1.1, R6.3)
 *
 * Description  : Reads and saves each branch's business hours and booking
 *                rules. A branch's settings are numbered revisions in
 *                branch_setting; the highest is current. Booking decisions
 *                read the current revision strictly; the admin Settings screen
 *                reads it tolerantly, so a section that can't be read can be
 *                saved again.
 *
 * Responsibilities :
 * - getBranchPolicy: the current revision for a booking decision; a 409 when
 *   the branch has no readable settings (never defaults)
 * - getBranchSettingsForAdmin: the current revision with who saved it, each
 *   section null when unreadable, and the recent history
 * - saveBranchSettingsSection: add the next revision with one section
 *   changed, refused when someone saved since the form was loaded
 * - countUpcomingBookingsAtBranch: a customer's pending and confirmed
 *   bookings at the branch from today on (the per-branch booking limit)
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL (jsonb)
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/errors, @rgss/types, ../index,
 *                ../schema/{auth,booking,branch,branch-setting},
 *                ./driver-errors
 *
 * Notes        :
 * - A save copies the other section from the current revision as stored. An
 *   unreadable section therefore stays unreadable, and the branch keeps
 *   refusing bookings, until that section is saved too.
 * - Two saves from the same revision: the later one collides on the unique
 *   key (or the 0020 numbering trigger) and is reported as stale.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import {
  type BookingRules,
  type BranchBookingSettings,
  type BranchSettingSection,
  type BranchSettingsRevisionView,
  type BranchSettingsView,
  type BusinessHours,
  bookingRulesSchema,
  businessHoursSchema,
} from '@rgss/types'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking } from '../schema/booking'
import { branch } from '../schema/branch'
import { branchSetting } from '../schema/branch-setting'
import { findDriverError, isConstraintViolation, SQLSTATE } from './driver-errors'

/** A branch's booking settings at its current revision, for a booking decision. */
export type BranchPolicyRecord = BranchBookingSettings & {
  branchId: string
  branchName: string
  revision: number
}

type StoredSection = NonNullable<(typeof branchSetting.$inferSelect)['changedSection']>

const STORED_SECTION: Record<BranchSettingSection, StoredSection> = {
  businessHours: 'business_hours',
  bookingRules: 'booking_rules',
}

const SECTION_OF: Record<StoredSection, BranchSettingSection> = {
  business_hours: 'businessHours',
  booking_rules: 'bookingRules',
}

const REVISION_UNIQUE = 'branch_setting_branch_revision_unique'

// The 0020 numbering trigger's message when a save isn't the next revision.
const NOT_NEXT_REVISION = 'so the next one is'

function settingsIncomplete(branchName: string) {
  return conflict(
    ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE,
    `${branchName} has no valid booking settings. The Developer sets them under Settings.`,
  )
}

function readHours(value: unknown): BusinessHours | null {
  const parsed = businessHoursSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function readRules(value: unknown): BookingRules | null {
  const parsed = bookingRulesSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

// The branch and its current revision in one read: no row when there is no
// such branch, null setting columns when it has no settings.
function currentRevisionOf(branchId: string) {
  return db
    .select({
      branchName: branch.name,
      revision: branchSetting.revision,
      businessHours: branchSetting.businessHours,
      bookingRules: branchSetting.bookingRules,
    })
    .from(branch)
    .leftJoin(branchSetting, eq(branchSetting.branchId, branch.id))
    .where(eq(branch.id, branchId))
    .orderBy(sql`${branchSetting.revision} desc nulls last`)
    .limit(1)
}

/**
 * The branch's current booking settings for a booking decision, or null when
 * there is no such branch. Throws 409 BRANCH_SETTINGS_INCOMPLETE when the
 * branch has no settings or they can't be read: nothing falls back to defaults
 * (tax-settings.md §3).
 */
export async function getBranchPolicy(branchId: string): Promise<BranchPolicyRecord | null> {
  const [row] = await currentRevisionOf(branchId)
  if (!row) {
    return null
  }
  const businessHours = readHours(row.businessHours)
  const bookingRules = readRules(row.bookingRules)
  if (row.revision === null || businessHours === null || bookingRules === null) {
    throw settingsIncomplete(row.branchName)
  }
  return {
    branchId,
    branchName: row.branchName,
    revision: row.revision,
    businessHours,
    bookingRules,
  }
}

const savedBy = alias(user, 'branch_setting_saved_by')

/**
 * The branch's settings for the admin Settings screen: the current revision,
 * each section null when it can't be read, and the latest `historyLimit`
 * revisions newest first. Null when there is no such branch.
 */
export async function getBranchSettingsForAdmin(
  branchId: string,
  historyLimit = 10,
): Promise<{ current: BranchSettingsView; history: BranchSettingsRevisionView[] } | null> {
  const [branchRows, rows] = await Promise.all([
    db.select({ name: branch.name }).from(branch).where(eq(branch.id, branchId)).limit(1),
    db
      .select({
        revision: branchSetting.revision,
        businessHours: branchSetting.businessHours,
        bookingRules: branchSetting.bookingRules,
        changedSection: branchSetting.changedSection,
        createdAt: branchSetting.createdAt,
        savedByName: savedBy.name,
      })
      .from(branchSetting)
      .leftJoin(savedBy, eq(savedBy.id, branchSetting.createdBy))
      .where(eq(branchSetting.branchId, branchId))
      .orderBy(desc(branchSetting.revision))
      .limit(Math.max(1, historyLimit)),
  ])
  const branchRow = branchRows[0]
  if (!branchRow) {
    return null
  }

  const latest = rows[0]
  const current: BranchSettingsView = {
    branchId,
    branchName: branchRow.name,
    revision: latest?.revision ?? 0,
    savedAt: latest ? latest.createdAt.toISOString() : null,
    savedByName: latest?.savedByName ?? null,
    businessHours: latest ? readHours(latest.businessHours) : null,
    bookingRules: latest ? readRules(latest.bookingRules) : null,
  }
  const history: BranchSettingsRevisionView[] = rows.map((r) => ({
    revision: r.revision,
    section: r.changedSection ? SECTION_OF[r.changedSection] : null,
    savedAt: r.createdAt.toISOString(),
    savedByName: r.savedByName ?? null,
  }))
  return { current, history }
}

/** One branch section and its validated value. */
export type BranchSettingsSectionValue =
  | { section: 'businessHours'; value: BusinessHours }
  | { section: 'bookingRules'; value: BookingRules }

export type SaveBranchSettingsResult =
  | { ok: true; revision: number; savedAt: Date }
  | { ok: false; reason: 'stale' | 'missing' }

// Someone saved after the form was loaded: the unique key or the numbering
// trigger refused this revision number.
function isStaleRevision(error: unknown): boolean {
  if (isConstraintViolation(error, SQLSTATE.uniqueViolation, [REVISION_UNIQUE])) {
    return true
  }
  const refused = findDriverError(error, [SQLSTATE.checkViolation])
  return typeof refused?.message === 'string' && refused.message.includes(NOT_NEXT_REVISION)
}

/**
 * Save one section as the branch's next revision. `expectedRevision` is the
 * revision the form was loaded with (0 when the branch had no settings); any
 * other current revision means someone saved since, and nothing is written.
 * The other section is carried over unchanged.
 */
export async function saveBranchSettingsSection(
  input: BranchSettingsSectionValue & {
    branchId: string
    expectedRevision: number
    actorId: string
  },
): Promise<SaveBranchSettingsResult> {
  const [latest] = await currentRevisionOf(input.branchId)
  if (!latest) {
    return { ok: false, reason: 'missing' }
  }
  const currentRevision = latest.revision ?? 0
  if (currentRevision !== input.expectedRevision) {
    return { ok: false, reason: 'stale' }
  }

  // The other section as stored ({} when the branch had none, which reads as
  // unset until it is saved).
  const businessHours =
    input.section === 'businessHours' ? input.value : (latest.businessHours ?? {})
  const bookingRules = input.section === 'bookingRules' ? input.value : (latest.bookingRules ?? {})

  try {
    const [saved] = await db
      .insert(branchSetting)
      .values({
        branchId: input.branchId,
        revision: currentRevision + 1,
        businessHours,
        bookingRules,
        changedSection: STORED_SECTION[input.section],
        createdBy: input.actorId,
      })
      .returning({ revision: branchSetting.revision, createdAt: branchSetting.createdAt })
    if (!saved) {
      return { ok: false, reason: 'stale' }
    }
    return { ok: true, revision: saved.revision, savedAt: saved.createdAt }
  } catch (error) {
    if (isStaleRevision(error)) {
      return { ok: false, reason: 'stale' }
    }
    throw error
  }
}

/**
 * The customer's pending and confirmed bookings at the branch dated
 * `todayISO` (IST, "YYYY-MM-DD") or later: what the branch's booking limit
 * counts. Bookings at other branches don't count.
 */
export async function countUpcomingBookingsAtBranch(
  customerId: string,
  branchId: string,
  todayISO: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(booking)
    .where(
      and(
        eq(booking.customerId, customerId),
        eq(booking.branchId, branchId),
        inArray(booking.status, ['pending', 'confirmed']),
        sql`${booking.bookingDate} >= ${todayISO}::date`,
      ),
    )
  return Number(row?.n ?? 0)
}
