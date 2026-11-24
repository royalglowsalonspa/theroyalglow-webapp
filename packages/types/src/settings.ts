/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settings (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + defaults for the admin Settings module. Each
 *                branch has its own business hours and booking rules, kept as
 *                numbered revisions (multi-branch R6.3); invoicing (test or
 *                live) is one setting for every branch.
 *
 * Responsibilities :
 * - Validate per-day business hours (7 days, IST 24h "HH:MM" strings)
 * - Validate booking rules (lead time, window, cancellation and reschedule
 *   cut-offs, reschedules per booking, active cap)
 * - Provide a section-discriminated update schema for PUT /api/settings; a
 *   branch section names the branch it was rendered for and the revision it
 *   was edited from
 * - Provide the DEFAULT constants a new database starts from
 *
 * Features / Functionality :
 * - timeStringSchema enforces 24h "HH:MM" via regex (IST, stored UTC-agnostic)
 * - businessHoursSchema keyed by mon…sun, each { open, close, closed }
 * - settingsUpdateSchema — discriminatedUnion on `section`
 * - DEFAULT_BUSINESS_HOURS: Mon–Fri 10:00–21:00, Sat–Sun 10:00–22:00
 * - DEFAULT_BOOKING_RULES: the salon's documented policy
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod, ./branch
 *
 * Notes        : Times are IST 24h "HH:MM" strings. GST is not a setting:
 *                each branch has effective-dated tax versions (./tax, R6.4).
 *                Stored settings that fail these schemas are an error, never
 *                replaced with defaults (tax-settings.md §3).
 ************************************************************/
import { z } from 'zod'
import { renderedBranchIdSchema } from './branch'
import { settlementSettingSchema } from './settlement'

/* ── Business hours ─────────────────────────────────────────────────────── */

/** The seven day keys, in week order (Monday first). */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAY_KEYS)[number]

/** Human labels for the day keys (admin UI). */
export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

/** IST 24-hour time-of-day as a "HH:MM" string (00:00–23:59). */
export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be 24-hour "HH:MM"')
export type TimeString = z.infer<typeof timeStringSchema>

/**
 * A single day's hours. When `closed` is true the salon is shut for the day and
 * `open`/`close` are null; when open, both `open` and `close` are present and
 * `close` must be strictly after `open`. `open`/`close` are nullable (not
 * optional) so the object satisfies exactOptionalPropertyTypes.
 */
export const dayHoursSchema = z
  .object({
    open: timeStringSchema.nullable(),
    close: timeStringSchema.nullable(),
    closed: z.boolean(),
  })
  .superRefine((day, ctx) => {
    if (day.closed) {
      return
    }
    if (day.open === null || day.close === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'open and close are required when the day is not closed',
        path: ['open'],
      })
      return
    }
    if (day.close <= day.open) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'close must be after open',
        path: ['close'],
      })
    }
  })
export type DayHours = z.infer<typeof dayHoursSchema>

/** Business hours for all seven days, keyed by `DayKey`. */
export const businessHoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
})
export type BusinessHours = z.infer<typeof businessHoursSchema>

/* GST is not a setting here: each branch has effective-dated tax versions per
   SAC code (./tax, multi-branch R6.4). */

/* ── Invoicing ──────────────────────────────────────────────────────────── */

/**
 * Whether invoices are real (multi-branch TX-08, TX-10). Off before the launch
 * tax review: invoices may use provisional rates and say so. On after it: a
 * branch needs its legal name, GSTIN and reviewed rates to invoice.
 */
export const invoicingSettingSchema = z.object({
  live: z.boolean(),
})
export type InvoicingSetting = z.infer<typeof invoicingSettingSchema>

/* ── Booking rules ──────────────────────────────────────────────────────── */

/**
 * Tunable booking-policy knobs, per branch. Slot length is per-service and
 * handled by the service catalogue — it is intentionally NOT part of this
 * schema.
 */
export const bookingRulesSchema = z.object({
  /** Minimum lead time before a slot, in minutes (e.g. 60 = book ≥1h ahead). */
  minAdvanceLeadTimeMinutes: z.number().int().min(0).max(10_080),
  /** How far ahead a customer may book, in days. */
  maxAdvanceBookingDays: z.number().int().min(1).max(365),
  /**
   * A cancellation this many hours or less before the appointment is a late
   * cancellation: still allowed and never charged, but counted on the
   * customer's record for reception to follow up.
   */
  cancellationCutoffHours: z.number().int().min(0).max(168),
  /** Max upcoming (pending/confirmed) bookings per customer at the branch. */
  maxActiveBookingsPerCustomer: z.number().int().min(1).max(50),
  /** A customer reschedules at least this many hours before the appointment. */
  rescheduleCutoffHours: z.number().int().min(0).max(168),
  /** Reschedules allowed per booking; after that the customer cancels and rebooks. */
  maxReschedulesPerBooking: z.number().int().min(0).max(10),
})
export type BookingRules = z.infer<typeof bookingRulesSchema>

/* ── A branch's booking settings ────────────────────────────────────────── */

/** The sections each branch keeps for itself (R1.1, R6.3). */
export const BRANCH_SETTING_SECTIONS = ['businessHours', 'bookingRules'] as const
export type BranchSettingSection = (typeof BRANCH_SETTING_SECTIONS)[number]

/** A branch's whole booking settings at one revision. */
export const branchBookingSettingsSchema = z.object({
  businessHours: businessHoursSchema,
  bookingRules: bookingRulesSchema,
})
export type BranchBookingSettings = z.infer<typeof branchBookingSettingsSchema>

/**
 * The active branch's booking settings as the admin Settings screen shows
 * them. A section is null when it is missing or can't be read: the branch
 * then refuses bookings until the Developer saves that section again.
 */
export type BranchSettingsView = {
  branchId: string
  branchName: string
  /**
   * Increases by one on every save; bookings record the revision they used.
   * 0 when the branch has no settings yet.
   */
  revision: number
  /** Null when the branch has no settings yet. */
  savedAt: string | null
  /** Null for a revision copied in by a migration or from another branch. */
  savedByName: string | null
  businessHours: BusinessHours | null
  bookingRules: BookingRules | null
}

/** One entry of a branch's settings history, newest first. */
export type BranchSettingsRevisionView = {
  revision: number
  /** The section that save changed; null when copied in whole. */
  section: BranchSettingSection | null
  savedAt: string
  savedByName: string | null
}

/* ── Section update ─────────────────────────────────────────────────────── */

/**
 * The editable section names (discriminator for PUT /api/settings). Business
 * hours and booking rules are the active branch's; invoicing and settlement
 * are one setting for every branch.
 */
export const SETTINGS_SECTIONS = [
  'businessHours',
  'bookingRules',
  'invoicing',
  'settlement',
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

// A branch section names the branch the form was rendered for (409 after a
// switch) and the revision it was edited from (409 when someone saved since;
// 0 when the branch had no settings yet).
const branchSectionFields = {
  branchId: renderedBranchIdSchema,
  expectedRevision: z.number().int().min(0),
}

/**
 * Section-discriminated update payload. Each section validates `value` with its
 * matching schema, so an invalid value for the named section is a 400.
 */
export const settingsUpdateSchema = z.discriminatedUnion('section', [
  z.object({
    section: z.literal('businessHours'),
    value: businessHoursSchema,
    ...branchSectionFields,
  }),
  z.object({
    section: z.literal('bookingRules'),
    value: bookingRulesSchema,
    ...branchSectionFields,
  }),
  z.object({ section: z.literal('invoicing'), value: invoicingSettingSchema }),
  z.object({ section: z.literal('settlement'), value: settlementSettingSchema }),
])
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>

/* ── Defaults ───────────────────────────────────────────────────────────── */

/** Mon–Fri 10:00–21:00, Sat–Sun 10:00–22:00 (none closed by default). */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { open: '10:00', close: '21:00', closed: false },
  tue: { open: '10:00', close: '21:00', closed: false },
  wed: { open: '10:00', close: '21:00', closed: false },
  thu: { open: '10:00', close: '21:00', closed: false },
  fri: { open: '10:00', close: '21:00', closed: false },
  sat: { open: '10:00', close: '22:00', closed: false },
  sun: { open: '10:00', close: '22:00', closed: false },
}

/** Test invoicing until the Developer switches it on after the tax review. */
export const DEFAULT_INVOICING: InvoicingSetting = { live: false }

/**
 * The salon's documented booking policy (features.md): a late cancellation
 * within 4 hours, two reschedules per booking up to an hour before.
 */
export const DEFAULT_BOOKING_RULES: BookingRules = {
  minAdvanceLeadTimeMinutes: 60,
  maxAdvanceBookingDays: 30,
  cancellationCutoffHours: 4,
  maxActiveBookingsPerCustomer: 3,
  rescheduleCutoffHours: 1,
  maxReschedulesPerBooking: 2,
}
