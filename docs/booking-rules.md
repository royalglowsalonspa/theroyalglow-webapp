# Booking Rules

> **For the owner:** these are sensible starting defaults. You can review and
> adjust every value live from the admin portal under **Settings → Booking
> Rules** (Manager+). Changes take effect immediately — no deploy needed.

The booking policy is stored in the `system_setting` table under the
`booking_rules` key and validated by `bookingRulesSchema` (`packages/types`).
When the key is absent, the defaults below apply.

## Defaults

| Rule | Key | Default | Meaning |
|------|-----|---------|---------|
| Minimum advance lead time | `minAdvanceLeadTimeMinutes` | **60** | A slot must start at least 60 minutes from now. Blocks last-second bookings the salon can't staff. |
| Maximum advance window | `maxAdvanceBookingDays` | **30** | Customers can book up to 30 days ahead. |
| Cancellation cut-off | `cancellationCutoffHours` | **4** | Free cancellation up to 4 hours before the appointment. |
| Max active bookings / customer | `maxActiveBookingsPerCustomer` | **3** | A customer may hold at most 3 pending/confirmed bookings at once. |

## Related (configured elsewhere)

- **Slot length** is set **per service** in the service catalogue (SPA: 30/60
  min; Salon: 5-minute steps). It is intentionally **not** part of booking
  rules — see **Settings → Services**.
- **Business hours** (per-day open/close) and **GST** (18%, price-inclusive)
  are separate sections in **Settings**.

## Notes

- Times across the platform are IST (UTC+5:30), stored as 24-hour `HH:MM`
  strings.
- Validation bounds (enforced by the schema): lead time 0–10080 min,
  window 1–365 days, cancellation 0–168 h, active cap 1–50.
