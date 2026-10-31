/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settings
 * Scope        : Data Access — System Settings
 *
 * Description  : Read/write helpers over the system_setting key/value table
 *                for the settings every branch shares: whether invoicing is
 *                live, and the cross-branch settlement share and value per
 *                gem. Each branch's business hours and booking rules are
 *                revisions in branch_setting (./branch-settings).
 *
 * Responsibilities :
 * - getInvoicingSetting()  — whether invoices are real (test until switched on)
 * - getSettlementSetting() — the settlement share and value per gem (R10)
 * - getSetting(key)        — read one raw setting value, or null when absent
 * - upsertSetting(...)     — single-row upsert via onConflictDoUpdate (target: key)
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL (jsonb)
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/errors, @rgss/types, ../index,
 *                ../schema/system
 *
 * Notes        : The system_setting `value` column is jsonb, so structured
 *                values are stored as JSON objects directly (no manual
 *                stringify). `key` carries a UNIQUE constraint that backs the
 *                upsert conflict target.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import {
  DEFAULT_INVOICING,
  DEFAULT_SETTLEMENT,
  type InvoicingSetting,
  invoicingSettingSchema,
  type SettlementSetting,
  settlementSettingSchema,
} from '@rgss/types'
import { eq } from 'drizzle-orm'
import { db } from '../index'
import { systemSetting } from '../schema/system'

/** The system_setting keys, by the Settings section they store. */
export const SETTING_KEYS = {
  invoicing: 'invoicing',
  settlement: 'settlement',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

/**
 * Whether invoices are real (TX-08). Absent or unreadable means test
 * invoicing, the safe side: invoices then say their rates are provisional.
 */
export async function getInvoicingSetting(): Promise<InvoicingSetting> {
  const parsed = invoicingSettingSchema.safeParse(await getSetting(SETTING_KEYS.invoicing))
  return parsed.success ? parsed.data : DEFAULT_INVOICING
}

/**
 * The share of a settlement amount the performing branch receives and the
 * value of one gem (settlement.md). Absent means the documented decisions:
 * 100% and ₹1.00. A stored value that can't be read is a 409 the Developer
 * fixes in Settings: an entry never records a guessed rate.
 */
export async function getSettlementSetting(): Promise<SettlementSetting> {
  const stored = await getSetting(SETTING_KEYS.settlement)
  if (stored === null) {
    return DEFAULT_SETTLEMENT
  }
  const parsed = settlementSettingSchema.safeParse(stored)
  if (!parsed.success) {
    throw conflict(
      ERROR_CODES.SETTLEMENT_SETTINGS_INVALID,
      "The settlement settings can't be read. Ask the Developer to save them again in Settings.",
    )
  }
  return parsed.data
}

/** Read a single setting's raw stored value by key, or null when not yet set. */
export async function getSetting(key: SettingKey): Promise<unknown | null> {
  const rows = await db
    .select({ value: systemSetting.value })
    .from(systemSetting)
    .where(eq(systemSetting.key, key))
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
