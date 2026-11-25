# Sentry and application state transitions

1. Keep Google sign-in usable when the automatic prompt fails. A rejected redirect must leave the customer able to retry.
2. Filter the confirmed injected-script Sentry signature only when the entire stack matches that source.
3. Prevent stale booking, redemption, notification, and branch-switch responses from changing the active UI. Allow one booking action at a time per screen.
4. Apply waitlist and booking state changes against their current database state. A rejected change must leave dependent records intact.
5. Return the original gems redemption when the same customer retries the same key after a concurrent commit.
6. Keep membership sale conflicts and expiry notices consistent with the recorded membership state.
7. Claim each reminder occurrence once when jobs overlap and allow the next eligible birthday, membership, or gems reminder.
8. Retain the required reason when a lead moves to lost.
9. Finish onboarding when the profile is already saved, including when browser storage is unavailable. Keep sign-out retryable after a request failure.
10. Replay a lost customer booking response without another write. Check the customer cap and branch closures in the booking transaction.
11. Save a staff edit only after its details are loaded and apply the profile and service selections atomically. Reject stale branch status changes.
12. Honor consent withdrawal in the active browser session and report unsuccessful enquiry delivery as retryable.
13. Revalidate the website after the CMS request completes, show only current offers, and schedule reminders against the current appointment slot.

Verify the changed transitions with focused tests and run the database regressions against synthetic PostgreSQL.
