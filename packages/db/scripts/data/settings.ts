/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settings
 * Scope        : Seed Data — System Settings
 *
 * Description  : System settings seed data defining application-wide configuration
 *                including contact info, GST rules, gems policies, and booking rules.
 *
 * Responsibilities :
 * - Define salon identity settings (name, phone, email, address)
 * - Define GST configuration (number, SAC code, rate)
 * - Define gems/loyalty rules (earn rate, value, expiry)
 * - Define booking policies (cancellation window, reschedule limits)
 * - Define no-show thresholds and recovery rules
 *
 * Features / Functionality :
 * - JSON values for structured settings (address object)
 * - Numeric values stored as-is (rate, threshold, days)
 * - Deterministic keys for programmatic access
 * - All 19 core business rules in one configuration set
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
  { key: 'gst_number', value: 'XXAAACR1234X1ZX' },
  { key: 'sac_code', value: '999721' },
  { key: 'gst_rate', value: 0.18 },
  { key: 'gems_earn_rate', value: 0.01 },
  { key: 'gems_value_paise', value: 100 },
  { key: 'gems_expiry_days', value: 365 },
  { key: 'cancellation_window_hours', value: 4 },
  { key: 'reschedule_window_hours', value: 1 },
  { key: 'reschedule_limit_per_booking', value: 2 },
  { key: 'noshow_approval_threshold', value: 4 },
  { key: 'noshow_flag_threshold', value: 5 },
  { key: 'noshow_recovery_bookings', value: 3 },
  { key: 'noshow_reset_window_days', value: 90 },
]
