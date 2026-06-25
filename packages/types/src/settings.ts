/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settings (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + defaults for the admin Settings module —
 *                business hours, GST configuration, and booking rules. These
 *                are persisted as JSON values in the system_setting key/value
 *                table and edited section-by-section from the admin portal.
 *
 * Responsibilities :
 * - Validate per-day business hours (7 days, IST 24h "HH:MM" strings)
 * - Validate GST configuration (rate percent + inclusive flag)
 * - Validate booking rules (lead time, window, cancellation, active cap)
 * - Provide a section-discriminated update schema for PUT /api/settings
 * - Provide DEFAULT constants applied when a setting is absent
 *
 * Features / Functionality :
 * - timeStringSchema enforces 24h "HH:MM" via regex (IST, stored UTC-agnostic)
 * - businessHoursSchema keyed by mon…sun, each { open, close, closed }
 * - settingsUpdateSchema — discriminatedUnion on `section`
 * - DEFAULT_BUSINESS_HOURS: Mon–Fri 10:00–21:00, Sat–Sun 10:00–22:00
 * - DEFAULT_GST: 18% inclusive · DEFAULT_BOOKING_RULES: sensible defaults
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Times are IST 24h "HH:MM" strings. GST is price-INCLUSIVE
 *                (18%, SAC 999721) per the project's billing convention.
 ************************************************************/
import { z } from 'zod'

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

/* ── GST ────────────────────────────────────────────────────────────────── */

/**
 * GST configuration. Prices are GST-INCLUSIVE across the platform; `inclusive`
 * is surfaced (and defaulted true) so the intent is explicit and auditable.
 */
export const gstSettingSchema = z.object({
  ratePercent: z.number().min(0).max(100),
  inclusive: z.boolean(),
})
export type GstSetting = z.infer<typeof gstSettingSchema>

/* ── Booking rules ──────────────────────────────────────────────────────── */

/**
 * Tunable booking-policy knobs. Slot length is per-service and handled by the
 * service catalogue — it is intentionally NOT part of this schema.
 */
export const bookingRulesSchema = z.object({
  /** Minimum lead time before a slot, in minutes (e.g. 60 = book ≥1h ahead). */
  minAdvanceLeadTimeMinutes: z.number().int().min(0).max(10_080),
  /** How far ahead a customer may book, in days. */
  maxAdvanceBookingDays: z.number().int().min(1).max(365),
  /** Cancellation cut-off before the appointment, in hours. */
  cancellationCutoffHours: z.number().int().min(0).max(168),
  /** Max concurrent active (pending/confirmed) bookings per customer. */
  maxActiveBookingsPerCustomer: z.number().int().min(1).max(50),
})
export type BookingRules = z.infer<typeof bookingRulesSchema>

/* ── Combined settings + section update ─────────────────────────────────── */

/** The full, defaults-applied settings object returned by GET /api/settings. */
export type Settings = {
  businessHours: BusinessHours
  gst: GstSetting
  bookingRules: BookingRules
}

/** The editable section names (discriminator for PUT /api/settings). */
export const SETTINGS_SECTIONS = ['businessHours', 'gst', 'bookingRules'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/**
 * Section-discriminated update payload. Each section validates `value` with its
 * matching schema, so an invalid value for the named section is a 400.
 */
export const settingsUpdateSchema = z.discriminatedUnion('section', [
  z.object({ section: z.literal('businessHours'), value: businessHoursSchema }),
  z.object({ section: z.literal('gst'), value: gstSettingSchema }),
  z.object({ section: z.literal('bookingRules'), value: bookingRulesSchema }),
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

/** 18% GST, price-inclusive (project-wide billing convention). */
export const DEFAULT_GST: GstSetting = {
  ratePercent: 18,
  inclusive: true,
}

/** Sensible booking-policy defaults (owner-adjustable from Settings). */
export const DEFAULT_BOOKING_RULES: BookingRules = {
  minAdvanceLeadTimeMinutes: 60,
  maxAdvanceBookingDays: 30,
  cancellationCutoffHours: 4,
  maxActiveBookingsPerCustomer: 3,
}
