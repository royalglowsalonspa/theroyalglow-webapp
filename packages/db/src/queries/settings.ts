/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settings
 * Scope        : Data Access — System Settings
 *
 * Description  : Read/write helpers over the system_setting key/value table for
 *                the admin Settings module. Structured config (business hours,
 *                GST, booking rules) is stored as JSON in the `value` (jsonb)
 *                column, one row per known key, and read back with schema
 *                validation + defaults applied when a key is absent or invalid.
 *
 * Responsibilities :
 * - getSettings()      — read all known keys → typed Settings (defaults applied)
 * - getSetting(key)    — read one raw setting value, or null when absent
 * - upsertSetting(...) — single-row upsert via onConflictDoUpdate (target: key)
 *
 * Features / Functionality :
 * - KNOWN_KEYS registry + SETTING_KEYS map keyed by Settings section name
 * - Stored JSON is re-validated with its Zod schema; invalid rows fall back to
 *   the default so a corrupt row can never break the admin UI
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL (jsonb)
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/system
 *
 * Notes        : The system_setting `value` column is jsonb, so structured
 *                values are stored as JSON objects directly (no manual
 *                stringify). `key` carries a UNIQUE constraint that backs the
 *                upsert conflict target.
 ************************************************************/

import {
  type BookingRules,
  type BusinessHours,
  bookingRulesSchema,
  businessHoursSchema,
  DEFAULT_BOOKING_RULES,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_GST,
  type GstSetting,
  gstSettingSchema,
  type Settings,
} from '@rgss/types'
import { inArray } from 'drizzle-orm'
import { db } from '../index'
import { systemSetting } from '../schema/system'

/**
 * Registry mapping each Settings section name to its system_setting `key`.
 * Section names mirror `settingsUpdateSchema` discriminators so the API can
 * resolve a section to its storage key with `SETTING_KEYS[section]`.
 */
export const SETTING_KEYS = {
  businessHours: 'business_hours',
  gst: 'gst',
  bookingRules: 'booking_rules',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

/** All known storage keys — used to scope the bulk read in getSettings(). */
export const KNOWN_KEYS: readonly SettingKey[] = Object.values(SETTING_KEYS)

// Minimal structural shape of a Zod schema's safeParse — lets this module
// validate stored values without taking a direct `zod` dependency (the db
// package only depends on @rgss/types).
type SafeParser<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false }
}

// Validate a stored jsonb value against its schema, falling back to the default
// when the key is absent or the stored shape is invalid (defence against a
// hand-edited / corrupt row breaking the admin UI).
function parseOr<T>(schema: SafeParser<T>, value: unknown, fallback: T): T {
  if (value === undefined || value === null) {
    return fallback
  }
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

/**
 * Read every known setting in one query and return a fully-typed `Settings`
 * object with defaults applied for any key that is absent or invalid.
 */
export async function getSettings(): Promise<Settings> {
  const rows = await db
    .select({ key: systemSetting.key, value: systemSetting.value })
    .from(systemSetting)
    .where(inArray(systemSetting.key, [...KNOWN_KEYS]))

  const byKey = new Map(rows.map((r) => [r.key, r.value]))

  return {
    businessHours: parseOr<BusinessHours>(
      businessHoursSchema,
      byKey.get(SETTING_KEYS.businessHours),
      DEFAULT_BUSINESS_HOURS,
    ),
    gst: parseOr<GstSetting>(gstSettingSchema, byKey.get(SETTING_KEYS.gst), DEFAULT_GST),
    bookingRules: parseOr<BookingRules>(
      bookingRulesSchema,
      byKey.get(SETTING_KEYS.bookingRules),
      DEFAULT_BOOKING_RULES,
    ),
  }
}

/**
 * Read a single setting's raw stored value by key, or null when not yet set.
 * Callers that need a typed/validated value should prefer getSettings().
 */
export async function getSetting(key: SettingKey): Promise<unknown | null> {
  const rows = await db
    .select({ value: systemSetting.value })
    .from(systemSetting)
    .where(inArray(systemSetting.key, [key]))
    .limit(1)

  return rows[0]?.value ?? null
}

/**
 * Insert-or-update a single setting row keyed by `key`. The UNIQUE constraint on
 * `system_setting.key` is the conflict target; `value` (jsonb) and `updatedBy`
 * are overwritten on conflict (`updatedAt` is bumped by the column's $onUpdate).
 * Returns the saved row.
 */
export async function upsertSetting(key: SettingKey, value: unknown, updatedBy?: string | null) {
  const [saved] = await db
    .insert(systemSetting)
    .values({ key, value, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value, updatedBy: updatedBy ?? null },
    })
    .returning()

  return saved as typeof systemSetting.$inferSelect
}
