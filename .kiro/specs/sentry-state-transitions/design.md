# Sentry and application state transition design

| Surface | Transition rule |
| --- | --- |
| Google sign-in | The automatic prompt starts once per page on an eligible visible browser. iOS keeps the explicit OAuth path. OAuth failure returns to a retryable state. |
| Client reporting | The injected rejection requires an exact exception and mechanism with only injected-script frames. Mixed stacks remain visible in Sentry. |
| Customer booking and gems | Treat an in-flight submission as exclusive. Ignore responses after a forced close and retain the redemption key for a retry of the same attempt. |
| Customer booking creation | Bind the request key to the authenticated customer and submitted details. Recheck the cap and branch admission while holding transaction locks shared by ordinary bookings and gems redemptions. |
| Booking details | Keep one active read and one write per screen. Ignore reads for a previous booking and disable competing actions until the current write settles. |
| Account and notifications | Continue from a saved profile if browser storage is unavailable. Surface sign-out failures and keep the button retryable. Apply notification read state after the server accepts it and discard obsolete polling results. |
| Admin branch selector | Distinguish loading, ready, and failed states. Retry failed branch reads and preserve the current branch when a switch fails. |
| Branch and staff edits | Require the observed status for a branch status transition. Save staff profile and service edits in one transaction with the current branch and role checked under lock. |
| Waitlist and leads | Compare the persisted status with the reviewed status when writing. Keep a lost lead's reason with the accepted transition. |
| Booking lifecycle | Use the slot reviewed by the route when starting a booking, and also compare status and reschedule count for cancellation and moves. A customer retry for the current slot returns the booking without using another move. Compare the scheduled end in IST for manual no-shows and pending closeout, including bookings that cross midnight. |
| Checkout | Use the reviewed status for checkout and its audit entry. Lock and compare service assignments before issuing invoices so a reassignment requires a fresh checkout. A completed membership session keeps its original idempotent response. |
| Gems ledger | Resolve a same-customer replay on a serialized balance shortfall or key collision. Preserve atomic allocation and spending. |
| Membership | Translate the exact active-membership conflict to the existing API response. Send renewal notices only once the term has elapsed and while the record is eligible. |
| Membership recording | Save the keyed request fingerprint alongside its booking and minute hold. Replay the request from the same actor, branch, and submitted session details. |
| Reminder and branch alert jobs | Use the existing atomic notification claim before dispatch. Keys identify the branch alert, IST day, birthday year, or membership and expiry occurrence as appropriate. Renewal email retries also use the provider's idempotency window. |
| Appointment and follow-up jobs | Deduplicate reminders for the current slot and compute overnight end times on the next IST day. Retry a configured follow-up email provider's refusal with the same provider key. |
| Consent and enquiries | Recheck consent before starting or calling analytics providers. A failed contact email returns a retryable response and the form reuses its provider key for the same draft. |
| Web Push | Keep at most one active account binding for each supported provider endpoint. A delivery failure can deactivate only the binding version it originally read. |
| CMS and offers | Schedule invalidation after the CMS response and expose failed refreshes in logs. The site only advertises offers from the current published feed. |

Existing domain guards still govern leave approval, booking completion, settlement, and invoice snapshots. The standalone invoice delivery service remains outside this release.
