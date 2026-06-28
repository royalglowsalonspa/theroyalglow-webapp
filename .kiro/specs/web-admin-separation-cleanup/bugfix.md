# Bugfix Requirements Document

## Introduction

The architecture rule for this monorepo is strict: `apps/web` serves the customer
site (`theroyalglow.in`) and MUST contain only customer-facing functionality;
`apps/admin` serves the admin portal (`admin.theroyalglow.in`) and MUST contain
only admin functionality. A previous migration moved admin code from `web` to
`admin`, but inconsistencies remain.

Admin-only functionality still lives in `apps/web` (the most visible being the 19
QStash background-job routes under `apps/web/src/app/api/jobs/`, plus admin-only
behaviour mixed into shared endpoints), and some functionality is duplicated across
both apps. This violates the separation rule and produces the discrepancies,
inconsistencies, and duplication the user wants eliminated.

An important nuance: several endpoints are legitimately split — they have a
customer-facing half that belongs in `web` and an admin-only half that belongs in
`admin`. The customer halves below are already customer-scoped today and MUST keep
working:

- `POST /api/leads` — public Meta-ad lead capture for `/book` (customer half stays in web)
- `GET /api/membership` — the caller's own SPA membership/sessions (customer half stays in web)
- `GET /api/offers` — public active-offer display (customer half stays in web)
- `GET|PATCH /api/notifications` — the caller's own notification feed (customer half stays in web)

The defect is specifically that admin-only functionality (admin lead-pipeline
management, admin membership CRUD, admin offer CRUD, background jobs, and any other
admin-side handlers/logic) is present in `apps/web` and/or duplicated across both
apps.

This fix is about **where code lives and whether it is duplicated**, not about
changing customer behaviour. All genuinely customer-facing functionality in `web`
must behave identically after the fix.

## Bug Analysis

### Current Behavior (Defect)

What currently happens, in violation of the web/admin separation rule:

1.1 WHEN admin-only functionality (e.g. admin lead-pipeline management, admin membership creation/CRUD, admin offer creation/CRUD) exists in `apps/web` THEN the system serves admin functionality from the customer app `theroyalglow.in`, violating the separation rule

1.2 WHEN the 19 background-job (QStash) routes under `apps/web/src/app/api/jobs/` are hosted in `apps/web` THEN the system runs admin/operational background jobs inside the customer app rather than from a single canonical admin-side location

1.3 WHEN a unit of functionality is implemented in both `apps/web` and `apps/admin` THEN the system contains duplicated functionality across the two apps, allowing the two copies to drift and behave inconsistently

1.4 WHEN admin-only request handlers or admin-only branches are co-located with customer handlers in `apps/web` THEN the system exposes admin-side code paths from the customer app, blurring the customer/admin boundary

### Expected Behavior (Correct)

What should happen instead, once the separation is restored:

2.1 WHEN admin-only functionality is identified in `apps/web` THEN the system SHALL host that functionality only in `apps/admin` and SHALL NOT serve it from `apps/web`

2.2 WHEN background-job (QStash) routes are deployed THEN the system SHALL host them in a single canonical location on the admin side (not in `apps/web`), with no duplicate copies remaining in the customer app

2.3 WHEN a unit of functionality exists THEN the system SHALL define it in exactly one app (customer functionality only in `apps/web`, admin functionality only in `apps/admin`), with no duplicated implementation across the two apps

2.4 WHEN an endpoint has both a customer-facing half and an admin-only half THEN the system SHALL keep the customer half in `apps/web` and SHALL relocate the admin-only half to `apps/admin`

### Unchanged Behavior (Regression Prevention)

Existing customer-facing behaviour that must be preserved exactly:

3.1 WHEN a customer submits the public Meta-ad lead capture form (`POST /api/leads` on `theroyalglow.in`) THEN the system SHALL CONTINUE TO accept and persist the lead with source attribution and fire the CAPI event, unchanged

3.2 WHEN an authenticated customer requests their own membership (`GET /api/membership` on `theroyalglow.in`) THEN the system SHALL CONTINUE TO return their active membership, session history, and past memberships, unchanged

3.3 WHEN any visitor requests active offers for display (`GET /api/offers` on `theroyalglow.in`) THEN the system SHALL CONTINUE TO return the active offers with applicable service names, unchanged

3.4 WHEN an authenticated customer reads or marks their notifications (`GET|PATCH /api/notifications` on `theroyalglow.in`) THEN the system SHALL CONTINUE TO return their own feed/unread count and mark notifications read, unchanged

3.5 WHEN a customer uses the genuinely customer-facing endpoints that already belong in `web` (auth, availability, bookings, contact, gems balance/catalogue, health, onboarding, profile, push, revalidate, services, ably/token) THEN the system SHALL CONTINUE TO serve them from `theroyalglow.in` with identical behaviour

3.6 WHEN any background job or admin operation runs after relocation THEN the system SHALL CONTINUE TO perform the same work (same schedule, inputs, and outcomes) from its canonical admin-side location, with no loss of functionality
