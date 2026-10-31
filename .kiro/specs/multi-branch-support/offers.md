# Offers in Payload: checkout rules, mirror and checkout

Implementation design for the offer items of [tasks](tasks.md) §6, written
31 October 2026 before the migrations. Requirements: R4.1, R4.5, R4.6, R4.7,
R4.8, R6.1, R7.5. Design context: [design](design.md) §4 (offer mirror row)
and §5. Branch availability, SAC codes and version history for the catalogue:
[catalogue-availability.md](catalogue-availability.md).

## Today (before this slice)

- Payload `offer` is a display-only card: title, description, discount label,
  image (required), CTA, category, `active`, `validFrom`/`validUntil`, order.
  The website's homepage and `/offers` read it from the CMS.
- Checkout rules live in the admin portal (Offers page, `POST`/`PATCH
  /api/offers`, Manager+) and the app's `offer`, `offer_service` and
  `offer_redemption` tables. Neon dev has no app offers; production's are test
  data (R4.8) and aren't migrated.
- The admin checkout panel never sends an offer, although
  `POST /api/bookings/[id]/complete` accepts `offerId`. When one is sent, the
  discount applies to every line on the booking (linked services are ignored,
  and a combo price is taken off the whole booking), the date check compares the
  UTC date, and the redemption row is written after the invoice commits, so two
  checkouts at once for one customer can both be discounted, the second then
  failing on the unique constraint after its invoice exists.
- `offer-auto-expire` flips `offer.is_active` after the end date.

## Decisions

- **One Payload offer holds the card and an optional checkout rule** (R4.8).
  New fields on `offer`:
  - `showOnWebsite` (checkbox, default on, "Show on website"). Off keeps the
    card off the website, for a counter-only discount. The image is required
    only while it is on.
  - A `rule` group, "Checkout rule": `type` (`none` default, `percentage`,
    `flat`, `combo_price`); `percentage` (whole number 1–100); `amountPaise`
    (flat, positive whole paise); `comboPricePaise` (positive whole paise);
    `services` (relationship to `service`, many); `terms` (shown at the
    counter).
  - `editedBy` and unlimited versions without drafts, as on services.
  - `active` stays the retire switch for the whole offer: an inactive offer is
    neither shown nor usable. Delete is disabled (R4.6): retire instead.
  - The card's `validFrom`/`validUntil` bound the rule too. A rule needs both,
    read as IST calendar days, inclusive, until on or after from.
- **Rule validation (Payload, on save).** The type's value is required and in
  range; a rule links at least one service (a combo at least two); every
  linked service is an active salon service with an active category (offers
  are salon-only), checked against `public.*` in the save's transaction.
- **Rule semantics at checkout.** The discount applies to the booking lines
  whose service the rule links:
  - percentage: `floor(linked total × percentage / 100)`;
  - flat: `min(amount, linked total)`;
  - combo: the booking must include every linked service; the discount is
    `max(0, linked total − combo price)`.
  A rule covering no line on the booking doesn't apply. A legacy admin offer
  with no linked services covers every line, as before. The invoice shares the
  discount across the linked lines only, in proportion to them, so each line's
  taxable value and tax follow its own share.
- **Mirror identity.** `public.offer` gains `cms_id` (integer, unique) and
  `show_on_website` (boolean, default true). A CMS offer's mirror has id
  `cms_offer_<cms id>` and slug `cms-offer-<cms id>`, stable across title
  changes. Rows without `cms_id` are the legacy admin offers.
- **Sync.** An `afterChange` hook on `offer`, in Payload's transaction through
  `txDb(req)`, before the existing revalidation hook:
  - a rule → upsert the mirror (name, description, type and value, IST start
    and end dates, active, terms, display order, show on website) and replace
    its `offer_service` rows;
  - no rule → retire an existing mirror (`is_active = false`, kept with its
    last rule for history); nothing when there is none.
  A sync error rolls the CMS save back. While `SERVICE_SYNC_ENABLED=false`, a
  save that has or had a rule is refused with a message, so the CMS never
  shows a rule the counter can't apply (design §5); card-only offers still
  save.
- **Checkout** (R4.5):
  - The panel lists the offers that apply to the booking, with the saving,
    from `GET /api/bookings/[id]/offers` (receptionist, active branch). It says
    when the customer has already used an offer today. Spa bookings,
    membership sessions and bookings made with gems take no offer.
  - Completion revalidates inside the completion batch: the redemption insert
    selects the offer only while it is active and today (IST) is within its
    dates, and aborts the batch otherwise (409 `OFFER_EXPIRED`); the unique
    `(customer_id, redeemed_date)` then refuses a second offer the same IST
    day at any branch (409 `OFFER_NOT_APPLICABLE`), so the invoice, gems and
    status change roll back with it. The booking records `offer_id`.
  - The date checks use the IST calendar day (`istToday`), not the UTC date.
- **Invoice snapshot** (R6.1). `invoice` gains `offer_id` (FK, restrict),
  `offer_name_snapshot`, `offer_type_snapshot` (`discount_type`) and
  `offer_value_snapshot` (percentage, or paise for flat and combo), all four
  set together or none (CHECK). The issued-invoice trigger
  (`invoice_snapshot_fixed`) also fixes them, so a later CMS edit never changes
  a past invoice.
- **Public lists.** The CMS card read adds `showOnWebsite != false`. Web
  `GET /api/offers` lists active rules shown on the website within today (IST).
- **Admin Offers is read-only** (R4.6). `POST /api/offers` and
  `PATCH /api/offers/[id]` answer 410 with the CMS link, as the service
  endpoints do; `GET` stays for the list. The page lists every offer with its
  rule, dates, linked services and whether it is shown on the website, links
  to Payload, and labels rows without `cms_id` as test offers made in the admin
  portal before the move.
- **Expiry job.** `offer-auto-expire` now only expires legacy offers
  (`cms_id IS NULL`). A CMS offer ends by its dates, which checkout and every
  list check, so its mirror keeps `active` as the CMS has it and drift stays
  clean.
- **Drift** (R4.7, R7.5). `service-drift-reconcile` also compares each CMS
  offer that has a rule, or whose mirror exists, with its mirror: missing or
  extra mirrors, name, type and value, IST dates, active, show on website and
  the linked services. Detect only, as before.
- **Out of this slice:** the Developer resync with revision checks (next
  slice), CMS roles, per-branch offers (R8.4) and redeeming gems from the
  checkout panel.

## Rollout order

App migrations 0035 (columns, checks) and 0036 (the invoice trigger) go in
before the CMS deploys: the offer hook writes `cms_id` and
`show_on_website`. Then the CMS (its start command applies the Payload
migration), then admin and web. Old code keeps working after 0035–0036: the
new columns are nullable or defaulted, and the old admin offers still save
(as legacy rows). The CMS migration only adds columns with defaults and drops
NOT NULL from the card image, so the old CMS still saves while the new one
starts.
