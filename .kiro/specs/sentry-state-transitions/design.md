# Sentry and application state transition design

| Surface | Transition rule |
| --- | --- |
| Google sign-in | The automatic prompt starts once per page on an eligible visible browser. iOS keeps the explicit OAuth path. OAuth failure returns to a retryable state. |
| Client reporting | The injected rejection requires an exact exception and mechanism with only injected-script frames. Mixed stacks remain visible in Sentry. |
| Customer booking and gems | Treat an in-flight submission as exclusive. Ignore responses after a forced close and retain the redemption key for a retry of the same attempt. |
| Booking details | Keep one active read and one write per screen. Ignore reads for a previous booking and disable competing actions until the current write settles. |
| Account and notifications | Continue from a saved profile if browser storage is unavailable. Surface sign-out failures and keep the button retryable. Apply notification read state after the server accepts it and discard obsolete polling results. |
| Admin branch selector | Distinguish loading, ready, and failed states. Retry failed branch reads and preserve the current branch when a switch fails. |
| Waitlist and leads | Compare the persisted status with the reviewed status when writing. Keep a lost lead's reason with the accepted transition. |
| Booking lifecycle | Use the slot reviewed by the route when starting a booking, and also compare status and reschedule count for cancellation and moves. A customer retry for the current slot returns the booking without using another move. Compare the scheduled end in IST for manual no-shows and pending closeout, including bookings that cross midnight. |
| Checkout | Use the reviewed status for checkout and its audit entry. Lock and compare service assignments before issuing invoices so a reassignment requires a fresh checkout. A completed membership session keeps its original idempotent response. |
| Gems ledger | Resolve a same-customer replay on a serialized balance shortfall or key collision. Preserve atomic allocation and spending. |
| Membership | Translate the exact active-membership conflict to the existing API response. Send renewal notices only once the term has elapsed and while the record is eligible. |
| Reminder and branch alert jobs | Use the existing atomic notification claim before dispatch. Keys identify the branch alert, IST day, birthday year, or membership and expiry occurrence as appropriate. Renewal email retries also use the provider's idempotency window. |

Existing domain guards still govern leave approval, booking completion, settlement, and invoice snapshots. The standalone invoice delivery service remains outside this release.
