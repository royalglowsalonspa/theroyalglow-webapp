# Catalogue tax codes, version history and branch availability

Implementation design for the first part of [tasks](tasks.md) §6, written
31 October 2026 before the migrations. Requirements: R4.1–R4.4, R4.7, R7.2.
Design context: [design](design.md) §4 (service/category availability row) and
§5. Tax codes: [Tax and branch settings](tax-settings.md) §1.

## Decisions

- **SAC codes are edited in Payload.** A category's code is required; a
  service's is optional and, when empty, the category's applies (the
  application already resolves `coalesce(service, category)` at issue). Both
  are selects limited to `REVIEWED_SAC_CODES` (`@rgss/types`). The CMS
  migration copies the codes the application already holds (0018 seeded every
  category), then fills any category still empty from the same slug table, and
  finally from its type (salon 999721, spa 999723) with a notice. The launch
  review (TX-10) checks the synced values.
- **Version history** is on for services and categories, without drafts, and
  keeps every version (`maxPerDoc: 0`). Payload's version rows don't name the
  editor, so each document has a read-only `editedBy` field that a field hook
  sets from the signed-in CMS login on every save and restore (`system` when
  there is none, e.g. a seed). A restore runs the same validation and sync as
  a normal save (Payload's `restoreVersion` runs the collection and field hooks
  and `afterChange`). Offers get versions with their new structure (§6 offers).
- **Availability** is "All branches" (default) or "Selected branches" on both a
  category and a service. A service is offered at a branch when its own and its
  category's availability both include it (R4.2). All branches includes branches
  added later. "Selected" needs at least one branch; to stop offering a service
  everywhere, untick Active instead.
- **Storage.** Public: `all_branches boolean not null default true` on
  `service` and `service_category`, plus join tables `service_branch` and
  `service_category_branch` (primary key entity + branch, cascade on both). The
  rows are ignored while `all_branches` is true; the sync keeps them empty
  then. Payload: a radio `availability` (`all` / `selected`) and a text
  `hasMany` field `availableBranches` holding branch ids.
- **Branch picker.** Branches live in the application schema, so the field uses
  a custom client component (`src/components/BranchAvailabilityField.tsx`) that
  lists them from a CMS endpoint, `GET /api/catalogue-branches` (signed-in CMS
  logins only; id, name, code and status from `public.branch`, shut-down
  branches only when already selected). The field's validation checks on save
  that every id names a branch; while editing it checks only the shape.
- **Sync.** The existing `afterChange` hooks also write `sac_code` and
  `all_branches` and replace the join rows, in the same Payload transaction, so
  a failure rolls the CMS save back (unchanged rule).
- **Enforcement.** One SQL function decides availability:
  `service_available_at(service_id, branch_id)`. A trigger on `booking_service`
  (insert, or a change of `service_id`) refuses a line whose service isn't
  offered at its booking's branch (check violation, constraint
  `booking_service_branch_availability`). Every write path that adds lines is
  covered: customer bookings and walk-ins (`createBookingWithServices`),
  membership sessions (`recordMembershipSession`) and gems redemptions
  (`redeemServiceWithGems`). There is no checkout-additions path today. The
  routes check first, with a message naming the service and branch (400
  `VALIDATION_ERROR`); the trigger is the backstop for every other writer.
- **Existing bookings keep their services** (R4.4): lines are checked only when
  added, so a booking made before a restriction can still be completed with
  its snapshot. The admin dashboard lists the active branch's bookings still to
  come (pending or confirmed) with a service it no longer offers, derived on
  read like the closed-day list; reception keeps, moves to a branch that offers
  it (rebook) or cancels each one.
- **Reads.** Catalogue reads return each service's effective branch list
  (`availableBranchIds`, null for all branches). The booking dialog and the
  gems catalogue filter by the chosen branch and drop selections the new branch
  doesn't offer; the walk-in form and the membership session panel filter by
  the active branch. Public services pages label a restricted service ("Only at
  Rayasandra", R7.2). Gems redemption uses a branch picker instead of the
  hard-coded Rayasandra default (R7.2).
- **Drift monitoring** (`service-drift-reconcile`) also compares SAC codes,
  `all_branches` and the branch lists.

## Rollout order

Public migrations 0033 (columns and tables) and 0034 (function and trigger)
first, then the Payload migration, then the app deploy. The CMS sync writes the
new public columns, and the drift job reads the new CMS tables. Until the
Payload migration runs, the old CMS code keeps writing without the new columns,
which default to all branches.

## As built (31 October 2026, Neon dev)

Applied: app migrations `0033_catalogue_branch_availability` (columns, join
tables, indexes) and `0034_catalogue_availability_guard` (function, trigger),
and Payload migration `20261031_015028_catalogue_tax_versions_availability`.
Drift reference after 0034: `14071646…c122`.

- **Payload.** `src/lib/catalogue-fields.ts` declares the shared fields:
  `sacCodeField` (select of `REVIEWED_SAC_CODES`, labelled with
  `SAC_CODE_LABELS`; required on a category, clearable on a service),
  `availabilityFields` (radio `availability`, default `all`; text `hasMany`
  `availableBranches`, shown only for `selected`, cleaned and cleared for All
  branches by a field hook, validated by `validateAvailableBranches`: at least
  one branch, and on save every id names a branch) and `editedByField`
  (read-only, sidebar, set by `setEditedBy` on every save and restore).
  Service and ServiceCategory keep `versions: { maxPerDoc: 0 }`. The picker is
  `src/components/BranchAvailabilityField.tsx` (options from
  `branch-options.ts`), registered with `admin.importMap.baseDir` = `src/`;
  the endpoint is `src/endpoints/catalogue-branches.ts`, mounted at
  `/api/catalogue-branches`. `@payloadcms/ui` 3.91.0 is now a direct
  dependency. The Payload migration was hand-reviewed: the category's
  `sac_code` is added nullable, filled from `public.service_category`, then
  from 0018's slug table, then by type, and only then made NOT NULL; service
  codes and any branch availability are copied from `public.*`.
- **Sync.** Both hooks now upsert on create and update (a save recreates a
  missing mirror row, R4.7), write `sac_code` and `all_branches`, and replace
  the join rows, in Payload's transaction. The seed script carries the codes
  and availability, and its pre-flight check refuses a category without a
  reviewed code.
- **Database.** `service_available_at(service_id, branch_id)`; trigger
  `booking_service_availability_guard` (BEFORE INSERT OR UPDATE OF
  `service_id` on `booking_service`) raises check violation
  `booking_service_branch_availability`. A write the trigger refuses after the
  route checked becomes 409 `CONFLICT` "The services offered at this branch
  just changed. Choose the services again." (`serviceNoLongerOffered`, in
  `createBookingWithServices`, `recordMembershipSession` and
  `redeemServiceWithGems`).
- **Reads.** `serviceAvailableBranchIds()` (queries/catalogue-availability.ts)
  is a correlated select fragment on `"service"."id"`, written out because
  Drizzle renders an embedded column unqualified in a single-table select
  (the first version broke `getAllServicesGrouped` with an ambiguous `id`;
  the admin E2E caught it). It feeds `getActiveCatalogue`,
  `getAllServicesGrouped`, `getServicesByIds`, `getServiceBySlug`,
  `getRedeemableServices` and `getRedeemableServiceById`.
  `getBookingsWithServicesNotOffered(branchId)` backs the dashboard list.
- **Business.** `packages/business/src/catalogue/availability.ts`:
  `effectiveBranchIds`, `isOfferedAt` (null or absent = every branch),
  `assertServicesOfferedAt` (400 "Hot Stone isn't offered at Marathahalli.
  Choose another service, or book at a branch that offers it.") and
  `availabilityLabel` ("Only at Rayasandra", public branches only).
- **Routes.** The check runs in web `POST /api/bookings` and
  `POST /api/gems/redeem`, admin `POST /api/bookings/new` and
  `POST /api/memberships/[id]/sessions`. Web `GET /api/services` adds each
  service's `availabilityNote`.
- **UI.** The booking dialog lists only what the chosen branch offers (a
  category with nothing there is hidden) and drops other selections when the
  branch changes; `/services` cards and `/services/[slug]` ("Where") show the
  note; `/gems` has a "Redeem at" picker when more than one branch takes
  bookings (replacing the hard-coded Rayasandra id) and lists the rewards that
  branch offers; the walk-in form and the membership session panel list the
  active branch's services; the admin dashboard has
  `UnofferedServiceBookingsPanel` (loader `unofferedServiceBookings`).
- **Drift.** `SERVICE_DRIFT_FIELDS` and `SERVICE_CATEGORY_DRIFT_FIELDS` add
  `sacCode`, `allBranches` and `branchIds`; the snapshot reads Payload's
  `<collection>_texts` rows under the path `availableBranches`.
- **Tests.** Business `catalogue/availability.test.ts` (incl. a property for
  the intersection) and drift cases; CMS `catalogue-fields.test.ts`,
  `catalogue-branches.test.ts`, the sync, mapper and property tests (the fake
  transaction now keeps join rows); web services, bookings and gems redeem
  route tests and `RedeemFlow.test.tsx`; admin walk-in and sessions route
  tests, the panel and loader tests; live
  `catalogue-availability.integration.test.ts` (6) and
  `service-drift.integration.test.ts` (2); admin E2E
  `catalogue-availability.spec.ts` (opt-in `ADMIN_E2E_WRITE_CATALOGUE=1`),
  passed as Receptionist and Developer.
- **Not built here.** Offers (versions, structure, sync, checkout) and the
  Developer resync come next in §6; there is no checkout-additions path to
  check yet. Restoring a version from before these fields fails validation
  on a category (its SAC code is now required), which is the intended
  fail-closed result.
