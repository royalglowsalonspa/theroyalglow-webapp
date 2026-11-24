/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settings
 * Scope        : Seed Data — System Settings
 *
 * Description  : System settings seed data defining application-wide configuration
 *                including contact info, gems policies and no-show rules.
 *
 * Responsibilities :
 * - Define salon identity settings (name, phone, email, address)
 * - Define gems/loyalty rules (earn rate, expiry) and the cross-branch
 *   settlement share and value per gem
 * - Define no-show thresholds and recovery rules (per customer, so shared)
 *
 * Features / Functionality :
 * - JSON values for structured settings (address object)
 * - Numeric values stored as-is (rate, threshold, days)
 * - Deterministic keys for programmatic access
 * - Booking policy is per branch (branch_setting), not seeded here
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : None
 *
 * Notes        : Settings are stored in system_setting table with JSONB values.
 *                Updated by admin via /admin/settings UI.
 ************************************************************/

export const systemSettings = [
  { key: 'salon_name', value: 'Royal Glow Salon & Spa' },
  { key: 'salon_phone', value: '+91 63601 35720' },
  { key: 'salon_email', value: 'hello@theroyalglow.in' },
  {
    key: 'salon_address',
    value: {
      line1: '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd',
      line2: 'Above SBI Bank, Naganathapura, Parappana Agrahara',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560100',
    },
  },
  { key: 'salon_lat', value: '12.874219217004518' },
  { key: 'salon_lng', value: '77.66475897572211' },
  // GST is not a setting: each branch's GSTIN is on the branch and its rates
  // are tax versions per SAC code (multi-branch R6.4). Business hours and
  // booking rules (cancellation and reschedule cut-offs, reschedules per
  // booking) are each branch's own, in branch_setting (R6.3).
  { key: 'gems_earn_rate', value: 0.01 },
  { key: 'gems_expiry_days', value: 365 },
  // Cross-branch settlement (R10): the performing branch receives 100% and a
  // gem spent at another branch is worth ₹1.00. Only the Developer changes it.
  { key: 'settlement', value: { shareBps: 10_000, gemValuePaise: 100 } },
  { key: 'noshow_approval_threshold', value: 4 },
  { key: 'noshow_flag_threshold', value: 5 },
  { key: 'noshow_recovery_bookings', value: 3 },
  { key: 'noshow_reset_window_days', value: 90 },
]
