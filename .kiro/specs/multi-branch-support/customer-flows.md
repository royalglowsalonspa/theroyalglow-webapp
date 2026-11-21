# Branch details, booking notifications, leads and privacy

Implementation design for the last customer-facing item of [tasks](tasks.md)
§6 (R3.4, R7.2, R7.3). It follows [catalogue availability](catalogue-availability.md),
[offers](offers.md) and [catalogue resync](catalogue-resync.md).

## Today (before this slice)

- The booking flow, availability, reminders, follow-ups, branch alerts and
  reports already use the booking's branch (§3–§5).
- The contact page and footer hard-code Rayasandra's address, phone and an
  hours table that may differ from the branch's saved business hours, and
  list no other branch.
- The salon's own changes to a booking (approve, reject, cancel, move) reach
  the customer only through the live booking channel: no push or email is
  sent ("Customer notifications for salon changes are not built yet").
- Leads are filed under a branch from the ad link, but can't be moved to
  another branch when the customer wants a different one.
- The privacy policy and onboarding consent don't say that the account is
  shared across Royal Glow branches.

## Decisions

- **Branch directory.** `getBranchDirectory(fromISO, toISO)` reads every
  branch that isn't shut down, in display order: its name, status (and a
  temporary closure's reason), address lines, phone, email and Google Maps
  link; the business hours of its current settings revision (null when they
  can't be read); and its closures, and every-branch closures, from today for
  30 days. Pure helpers in `@rgss/business` group the week's hours into rows
  ("Mon – Fri", "10:00 AM – 9:00 PM"; closed days say "Closed") and format
  address lines.
- **Website.** The customer layout reads the directory once per request
  through a five-minute in-process cache (branch details change rarely) and
  passes it to the footer. The contact page lists each branch: address, phone,
  email, directions link, hours and upcoming closures, with "Opening soon" or
  "Temporarily closed" when it applies. Without the directory (a failed read),
  both fall back to today's Rayasandra content. The legal pages keep the
  company contact (`BUSINESS`), and so does the business JSON-LD: it
  describes the primary branch.
- **Contact form.** With more than one branch, the form asks which branch the
  message is for. The enquiry goes to that branch's email, else the main
  inbox; the subject names the branch. An unknown branch id falls back to the
  main inbox.
- **Booking notifications.** When the salon confirms, rejects, cancels or
  moves a booking, the customer gets an in-app/push notification and an
  email naming the branch, with its address, phone and directions link and a
  link to the booking. Sent after the write, best-effort: a provider failure
  never changes the response. A confirmation, rejection or cancellation is
  sent once per booking; each move is sent. Customer-made changes send
  nothing: the customer sees the result on the page.
- **Moving a lead.** `POST /api/leads/[id]/move { branchId, toBranchId }`
  (receptionist or above at the lead's branch). The destination must exist,
  differ from the source and not be shut down (the same rule as an ad link,
  `resolveLeadBranch`); only an open lead (new, contacted, follow-up) moves.
  The guarded update clears the assignee (they work at the source branch);
  the notes go with the lead. The response names only the destination; the
  source operator never sees its pipeline, and the lead is no longer found at
  the source. The move is audited with both branches. `GET /api/leads/[id]`
  lists the possible destinations (id and name).
- **Privacy copy.** The privacy policy gains a section on sharing across
  Royal Glow branches: the account, contact details, consents, preferences,
  gems and memberships are shared so the customer can book at any branch;
  each branch sees visit dates, branches and services, while amounts paid,
  invoices and private notes stay with the branch that made them. The
  onboarding consent repeats it in one sentence.

## Out of scope

Per-branch JSON-LD and map embeds, customer-made change notifications,
notifying the destination branch of a moved lead, and legal review of the
privacy wording.
