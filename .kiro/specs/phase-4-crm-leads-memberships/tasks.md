# Implementation Plan: Phase 4 — CRM, Leads & Memberships

## Overview

Implement the customer-relationship layer on top of the Phase 3 booking backend: Lead Pipeline, CRM (customer directory + profiles), SPA Memberships (create + session recording), and the customer-facing Loyalty (Gems) view. All nine underlying tables already exist and are pushed to Neon, so this phase is additive (no migrations). Work follows the established layered architecture: Zod types → pure business logic → Drizzle query layer → thin API routes → pages. Verification uses `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome).

## Tasks

- [x] 1. Lead domain types and business logic
  - Create `packages/types/src/lead.ts`: `createLeadSchema` (name, Indian phone, optional email, optional serviceInterestedId, optional source + utm fields), `manualLeadSchema` (source literal `manual`), `updateLeadStatusSchema` (status enum + optional reason), `addLeadNoteSchema`; export inferred types and `LEAD_STATUSES`
  - Create `packages/business/src/lead/phone.ts`: `normaliseIndianPhone(raw)` → canonical `+91XXXXXXXXXX`
  - Create `packages/business/src/lead/status.ts`: `ALLOWED_LEAD_TRANSITIONS` map + `assertLeadTransition(from, to, reason?)` throwing `AppError` 409 for illegal transitions and 400 when `lost` lacks a reason
  - Create `packages/business/src/lead/stale.ts`: `hoursSince(createdAt, now?)` + `isLeadStale(status, createdAt, now?)` (true iff status `new` AND ≥48h)
  - Add `packages/business/src/lead/index.ts` and re-export from `packages/business/src/index.ts`; export new schemas from `packages/types/src/index.ts`
  - _Requirements: 1.1, 1.3, 1.6, 2.2, 2.3, 2.4_

- [x] 2. Lead query layer
  - Create `packages/db/src/queries/leads.ts`: `createLead(data)`, `getLeadById(id)` (lead + service name + assigned-to name + linked customer/booking), `getLeadNotes(leadId)` (author name, newest first), `getLeadsForPipeline(filters?)` (flat rows + joined service name), `updateLead(id, patch)`, `addLeadNote(leadId, authorId, content)`, `getServiceInterestOptions()` (active services with serviceType)
  - Re-export `./leads` from `packages/db/src/queries/index.ts`
  - _Requirements: 1.1, 1.4, 1.5, 2.5, 2.6_

- [x] 3. Public lead capture API + landing page
  - Create `apps/web/src/app/api/leads/route.ts` POST (public, no auth): `safeParse` → `normaliseIndianPhone` → `createLead` with `source` default `meta_ad` → return `{ leadId }` (201). Apply a rate-limit guard (Upstash if configured, else a lightweight no-op guard with a TODO). Leave a commented CAPI extension point
  - Create `apps/web/src/app/(landing)/layout.tsx`: minimal chrome (no header/footer/nav)
  - Create `apps/web/src/app/(landing)/book/page.tsx`: server component, `metadata.robots = { index:false, follow:false }`, fetches service-interest options, reads `utm_*` from awaited `searchParams`, renders client `LeadCaptureForm`
  - Create `apps/web/src/components/lead/LeadCaptureForm.tsx`: name, phone (+91 prefix), service dropdown, "Continue to Booking" CTA; states idle/validation/submitting/success(1.5s)/error; on success `router.push('/?book=1&leadId=' + id)`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 9.1, 9.2, 9.3_

- [x] 4. Admin lead pipeline API
  - Create `apps/web/src/app/api/admin/leads/route.ts`: GET (`requireRole('receptionist')`, optional `?status=` filter, returns rows with `daysSinceCapture` + `isStale`); POST (manual lead, `source='manual'`)
  - Create `apps/web/src/app/api/admin/leads/[id]/route.ts`: GET detail; PATCH (`updateLeadStatusSchema` → `assertLeadTransition` → `updateLead`, set `lastContactedAt` on `contacted`)
  - Create `apps/web/src/app/api/admin/leads/[id]/notes/route.ts`: POST add note
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1, 9.2_

- [x] 5. Admin lead pipeline pages
  - Create `apps/web/src/app/admin/leads/page.tsx`: server-fetch pipeline rows, render client `LeadKanban`
  - Create `apps/web/src/components/lead/LeadKanban.tsx`: 5 columns (New / Contacted / Follow-up / Booked / Won+Lost); cards show name, tap-to-call phone, service interest, campaign, days-since, stale dot; "+ Manual Lead" dialog
  - Create `apps/web/src/app/admin/leads/[id]/page.tsx` + `LeadDetail` client component: info card (Call / WhatsApp `https://wa.me/91...` / status actions / Mark Lost with reason), attribution panel, notes timeline with add-note box
  - _Requirements: 2.1, 2.4, 2.5, 2.6_

- [x] 6. CRM types and query layer
  - Create `packages/types/src/customer.ts`: `customerListQuerySchema` (q, sort enum, page, pageSize, tag), `assignTagSchema`, `createTagSchema`, `addCustomerNoteSchema`; export `CUSTOMER_SORT` and inferred types; re-export from index
  - Create `packages/db/src/queries/customers.ts`: `getCustomers(query)` (paginated/searchable/sortable, returns `{ rows, totalCount }`, joins customer_profile + loyalty balance + tags), `getCustomerProfile(userId)`, `getCustomerBookings/Invoices/Membership/Notes`, `getAllTags`, `createTag` (slugify), `assignTag` (idempotent upsert), `removeTag`, `addCustomerNote`
  - Re-export `./customers` from queries index
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.5_

- [x] 7. CRM API routes
  - Create `apps/web/src/app/api/admin/customers/route.ts` GET (`requireRole('receptionist')`, paginated with `meta`)
  - Create `apps/web/src/app/api/admin/customers/[id]/route.ts` GET (profile detail) + PATCH (`requireRole('manager')`, e.g. reset noshowCount)
  - Create `apps/web/src/app/api/admin/customers/[id]/tags/route.ts` POST (assign) and `.../tags/[tagId]/route.ts` DELETE (remove)
  - Create `apps/web/src/app/api/admin/customers/[id]/notes/route.ts` POST
  - Create `apps/web/src/app/api/admin/tags/route.ts` GET (receptionist) + POST (`requireRole('manager')`)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 9.1, 9.2_

- [x] 8. CRM pages
  - Create `apps/web/src/app/admin/customers/page.tsx` + client `CustomersTable`: search box, sort dropdown, tag filter, paginated table (Name, Phone, Tags, Visits, LTV, Gems, Last Visit) using `meta.page/totalPages`
  - Create `apps/web/src/app/admin/customers/[id]/page.tsx` + client `CustomerProfile`: header (contact, since, tag chips add/remove), KPI cards (Visits, LTV, Avg Spend, No-shows, Gems), tabs (Bookings / Invoices / Membership / Gems / Notes)
  - _Requirements: 3.6, 4.1, 4.2, 4.5_

- [x] 9. Membership types and business logic
  - Create `packages/types/src/membership.ts`: `createMembershipSchema` (customerId, tierId, hoursMinutes, pricePaise, startDate, validityDays, paymentMethod, notes), `recordSessionSchema` (services[] with serviceId/staffId/durationMinutes, optional bookingDate), `cancelMembershipSchema` (reason); re-export from index
  - Create `packages/business/src/membership/number.ts`: `generateMembershipNumber(branchNumber, date)` → `RG-MEM-{YY}-{branchNumber}-{5random}`
  - Create `packages/business/src/membership/validity.ts`: `computeExpiry(startDate, validityDays)` (end-of-day IST)
  - Create `packages/business/src/membership/hours.ts`: `remainingMinutes(total, used)` + `assertSessionRecordable(m, requestedMinutes, now?)` throwing `MEMBERSHIP_EXPIRED` / `MEMBERSHIP_INSUFFICIENT_HOURS`
  - Add `packages/business/src/membership/index.ts`, re-export from business index
  - _Requirements: 5.2, 5.3, 6.2, 6.3_

- [x] 10. Membership query layer
  - Create `packages/db/src/queries/memberships.ts`: `getMembershipTiers()`, `getMembershipById(id)` (+ customer/tier/sessions), `getMemberships(filters?)`, `getActiveMembershipForCustomer(customerId)`, `getMembershipSessions(membershipId)`, `createMembershipWithInvoice(params)` (pre-check active, `db.batch`: membership + membership_purchase invoice + invoice_item, set `invoiceId`), `recordMembershipSession(params)` (`db.batch`: completed ₹0 booking + booking_service + membership_session invoice + items + `usedHoursMinutes += total`), `cancelMembership(id, reason)`
  - Re-export `./memberships` from queries index
  - _Requirements: 5.1, 5.4, 5.5, 5.6, 6.1, 6.2, 6.4_

- [x] 11. Membership admin API routes
  - Create `apps/web/src/app/api/admin/memberships/route.ts`: GET list (filter tier/status) + POST create (`requireRole('receptionist')`, pre-check `MEMBERSHIP_ALREADY_ACTIVE`, generate membership + invoice numbers, gems 0, `splitGST` for purchase total)
  - Create `apps/web/src/app/api/admin/memberships/[id]/route.ts` GET detail
  - Create `apps/web/src/app/api/admin/memberships/[id]/sessions/route.ts` POST (`assertSessionRecordable` → `recordMembershipSession`)
  - Create `apps/web/src/app/api/admin/memberships/[id]/cancel/route.ts` POST (`requireRole('manager')`)
  - Create `apps/web/src/app/api/admin/membership-tiers/route.ts` GET
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 9.2_

- [x] 12. Membership admin pages
  - Create `apps/web/src/app/admin/memberships/page.tsx` + `MembershipsList`: tier/status filters, "+ Create Membership"
  - Create `apps/web/src/app/admin/memberships/new/page.tsx` + `CreateMembershipForm`: customer search, tier cards (prefill hours/price/validity, overridable), start date + auto expiry preview, payment method, side-effects note (invoice, no gems)
  - Create `apps/web/src/app/admin/memberships/[id]/page.tsx` + `MembershipDetail`: hours-balance bar, expiry/days-left, session history, Record Session modal (validate duration ≤ remaining), Cancel Membership (manager+)
  - _Requirements: 5.1, 6.1, 6.3_

- [x] 13. Customer membership view (API + page)
  - Create `apps/web/src/app/api/membership/route.ts` GET (`requireSession`, scope to `session.user.id`, return active + past memberships with sessions)
  - Create `apps/web/src/app/(customer)/membership/page.tsx`: active membership card (tier, number, hours bar, validity, urgency banner ≤30d/≤7d), session history, collapsible past memberships, empty state with call CTA
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2_

- [x] 14. Loyalty (gems) read queries + customer view
  - Create `packages/db/src/queries/loyalty.ts`: `getLoyaltySummary(customerId)`, `getLoyaltyTransactions(customerId, limit, offset)` (+ invoice number, expiry), `getRedeemableServices()`; re-export the existing `getOrCreateLoyaltyAccount`/`addGemsTransaction` here for domain cohesion; update queries index (keep `@rgss/db/queries` import used by booking completion working)
  - Create `apps/web/src/app/api/gems/route.ts` GET (`requireSession`, scope to `session.user.id`, return balance + paginated transactions + redeemable catalogue)
  - Create `apps/web/src/app/(customer)/gems/page.tsx`: balance hero (current/earned/redeemed), redeemable catalogue grid, transaction history, "1 gem per ₹100, 365-day expiry" explainer
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2_

- [x] 15. Navigation integration
  - Add Membership and Gems links to the authenticated customer nav in `apps/web/src/components/layout/Header.tsx` and `apps/web/src/components/layout/MobileNav.tsx`
  - Confirm `/book` remains unlinked from all site navigation
  - _Requirements: 9.4_

- [x] 16. Verification — typecheck and lint
  - Run `SKIP_ENV_VALIDATION=1 bun run typecheck` across the workspace; resolve all type errors in new files (no `any`, no `@ts-ignore`)
  - Run `bun run lint` (Biome) and fix issues
  - Verify Next.js 16 async `params`/`searchParams` are awaited in every new page/route
  - _Requirements: 9.1, 9.2_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "6", "9"] },
    { "id": 1, "tasks": ["2", "10", "14"] },
    { "id": 2, "tasks": ["3", "4", "7", "11", "13"] },
    { "id": 3, "tasks": ["5", "8", "12", "15"] },
    { "id": 4, "tasks": ["16"] }
  ]
}
```

## Notes

- All nine Phase 4 tables already exist in `packages/db/src/schema` and are pushed to Neon — no migrations are expected. If a genuine gap surfaces during implementation, add an additive nullable column and push via `cd packages/db && bunx drizzle-kit push`.
- Reuse existing helpers: `splitGST`, `generateInvoiceNumber`, `getOrCreateLoyaltyAccount`, `addGemsTransaction`, `requireSession`/`requireRole`, `withErrorHandler`/`apiSuccess`. All error codes used are already in `packages/errors/src/codes.ts`.
- Use `db.batch()` (not `db.transaction`) for all multi-row writes — neon-http has no interactive transactions. Pre-generate parent IDs so children reference them within the same batch.
- Money is integer paise; convert rupees → paise once at the API boundary (`Math.round(rupees * 100)`). Display via `formatINR` / `formatDateIN` from `@rgss/business/utils` only at the presentation layer.
- Manual tags only this phase; auto-tags (`vip`, `loyal`, `no_show_*`) depend on Phase 6 background jobs. Gems redemption write-path and Meta CAPI are deferred.
- Customer self-service routes (`/api/membership`, `/api/gems`) must scope strictly to `session.user.id`; non-owned resources return 404, never another user's data.
