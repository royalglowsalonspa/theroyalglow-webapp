# Implementation Plan: Database Schema (Phase 1.1)

## Overview

Implement all 38 Drizzle ORM table definitions across 15 domain files, 14 relation files, and barrel files in `packages/db/src/schema/`. Tables are created in dependency order — enums first, then tables without FK dependencies, then tables referencing earlier tables. All files use TypeScript strict mode with Drizzle ORM's `pgTable`, `pgEnum`, nanoid PKs, paise for money, and `timestamptz` for timestamps.

## Tasks

- [x] 1. Define all PostgreSQL enums
  - [x] 1.1 Create `packages/db/src/schema/enums.ts` with all 17 pgEnum definitions
    - Export: `bookingStatusEnum`, `leadStatusEnum`, `paymentStatusEnum`, `paymentMethodEnum`, `waitlistStatusEnum`, `notificationTypeEnum`, `notificationChannelEnum`, `notificationStatusEnum`, `loyaltyTxTypeEnum`, `staffDesignationEnum`, `genderEnum`, `auditActionEnum`, `serviceTypeEnum`, `discountTypeEnum`, `spaMembershipStatusEnum`, `invoiceTypeEnum`, `leaveApprovalStatusEnum`, `leaveTypeEnum`, `branchStatusEnum`
    - Each enum uses `pgEnum` from `drizzle-orm/pg-core` with exact values from requirements
    - `notificationTypeEnum` must include all 26 notification type values
    - _Requirements: 1.1–1.20_

- [x] 2. Create auth and branch tables (no cross-domain FK dependencies)
  - [x] 2.1 Create `packages/db/src/schema/auth.ts` with user, session, account, verification tables
    - `user`: id (text PK nanoid), name, email (UNIQUE), email_verified, image, role, banned (DEFAULT false), ban_reason, ban_expires, created_at, updated_at
    - `session`: id (text PK), user_id (FK → user.id CASCADE), expires_at, token (UNIQUE), ip_address, user_agent, created_at, updated_at
    - `account`: id (text PK), user_id (FK → user.id CASCADE), account_id, provider_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at
    - `verification`: id (text PK), identifier, value, expires_at, created_at (nullable), updated_at (nullable)
    - Indexes on: session.user_id, account.user_id
    - _Requirements: 2.1–2.5, 18.1–18.6_

  - [x] 2.2 Create `packages/db/src/schema/branch.ts` with branch table
    - `branch`: id (text PK nanoid), number (integer UNIQUE), code (text UNIQUE), name, address_line1, address_line2, city (DEFAULT 'Bengaluru'), state (DEFAULT 'Karnataka'), pincode, phone, email, google_maps_url, google_maps_place_id, latitude (numeric(10,7)), longitude (numeric(10,7)), status (branch_status DEFAULT 'operational'), opening_date, closing_date, temporary_close_reason, is_primary (DEFAULT false), display_order (DEFAULT 0), created_by (FK → user.id RESTRICT nullable), created_at, updated_at
    - _Requirements: 4.1, 18.1–18.6_

- [x] 3. Create profile and service tables (depend on auth)
  - [x] 3.1 Create `packages/db/src/schema/profile.ts` with customer_profile and staff_profile tables
    - `customer_profile`: id (text PK nanoid), user_id (UNIQUE FK → user.id CASCADE), phone, gender (enum), date_of_birth, marketing_consent (DEFAULT false), marketing_consent_at, appointment_reminders_enabled (DEFAULT true), membership_alerts_enabled (DEFAULT true), acquisition_source, utm_campaign, utm_medium, utm_source, first_visit_at, last_visit_at, total_visits (DEFAULT 0), total_spent_paise (DEFAULT 0), noshow_count (DEFAULT 0), late_cancellation_count (DEFAULT 0), consecutive_completed_bookings (DEFAULT 0), booking_requires_approval (DEFAULT false), created_at, updated_at
    - `staff_profile`: id (text PK nanoid), user_id (UNIQUE FK → user.id CASCADE), phone, designation (staff_designation enum NOT NULL), bio, specialization, is_active (DEFAULT true), hire_date, created_at, updated_at
    - Indexes on: customer_profile.user_id, staff_profile.user_id
    - _Requirements: 3.1–3.3, 18.1–18.6_

  - [x] 3.2 Create `packages/db/src/schema/service.ts` with service_category, service, staff_service tables
    - `service_category`: id (text PK nanoid), name, slug (UNIQUE), description, service_type (enum NOT NULL), display_order (DEFAULT 0), is_active (DEFAULT true), created_at, updated_at
    - `service`: id (text PK nanoid), category_id (FK → service_category.id RESTRICT), name, slug (UNIQUE), description, duration_minutes, buffer_minutes (DEFAULT 0), price_paise (integer), is_active (DEFAULT true), image_url, display_order (DEFAULT 0), gems_redeemable (DEFAULT false), gems_required (nullable), gems_catalogue_order (nullable), created_at, updated_at
    - `staff_service`: composite PK (staff_id, service_id), staff_id (FK → staff_profile.id CASCADE), service_id (FK → service.id CASCADE)
    - Indexes: service.category_id, partial index on service WHERE gems_redeemable = true AND is_active = true ordered by gems_catalogue_order
    - _Requirements: 5.1–5.5, 18.1–18.6_

- [x] 4. Create schedule tables (depend on profile)
  - [x] 4.1 Create `packages/db/src/schema/schedule.ts` with staff_schedule, staff_time_off, business_hour, holiday tables
    - `staff_schedule`: id (text PK nanoid), staff_id (FK → staff_profile.id CASCADE), day_of_week (integer), start_time (time nullable), end_time (time nullable), is_working (DEFAULT true), UNIQUE constraint on (staff_id, day_of_week)
    - `staff_time_off`: id (text PK nanoid), staff_id (FK → staff_profile.id CASCADE), leave_type (leave_type enum DEFAULT 'personal'), date, reason, approval_status (leave_approval_status enum DEFAULT 'pending'), reviewed_by (FK → user.id nullable), reviewed_at, rejection_reason, created_at, updated_at, UNIQUE constraint on (staff_id, date)
    - `business_hour`: id (text PK nanoid), day_of_week (integer UNIQUE), open_time (time nullable), close_time (time nullable), is_open (DEFAULT true)
    - `holiday`: id (text PK nanoid), date (UNIQUE), name, created_at
    - Indexes: staff_schedule(staff_id, day_of_week), staff_time_off(staff_id, date)
    - _Requirements: 6.1–6.5, 18.1–18.6_

- [x] 5. Create offer and membership tables (depend on service, branch)
  - [x] 5.1 Create `packages/db/src/schema/offer.ts` with offer, offer_service, offer_redemption tables
    - `offer`: id (text PK nanoid), name, slug (UNIQUE), description, offer_type (discount_type enum), discount_percentage (nullable), discount_amount_paise (nullable), combo_price_paise (nullable), start_date, end_date, is_active (DEFAULT true), terms, image_url, display_order (DEFAULT 0), created_at, updated_at
    - `offer_service`: composite PK (offer_id, service_id), offer_id (FK → offer.id CASCADE), service_id (FK → service.id CASCADE)
    - `offer_redemption`: id (text PK nanoid), offer_id (FK → offer.id RESTRICT), customer_id (FK → user.id RESTRICT), booking_id (FK → booking.id RESTRICT), redeemed_date, created_at, UNIQUE constraint on (customer_id, redeemed_date)
    - Indexes: offer(display_order) partial WHERE is_active = true, offer_redemption(customer_id, redeemed_date), offer_redemption(offer_id)
    - Note: offer_redemption.booking_id FK will reference booking table (created in task 6.1) — use forward reference pattern
    - _Requirements: 10.1–10.4, 18.1–18.6_

  - [x] 5.2 Create `packages/db/src/schema/membership.ts` with spa_membership_tier, spa_membership tables
    - `spa_membership_tier`: id (text PK nanoid), name (UNIQUE), slug (UNIQUE), description, default_hours_minutes (integer), default_price_paise (integer), default_validity_days (integer), is_active (DEFAULT true), display_order (DEFAULT 0), created_at, updated_at
    - `spa_membership`: id (text PK nanoid), membership_number (UNIQUE), customer_id (FK → user.id RESTRICT), tier_id (FK → spa_membership_tier.id RESTRICT), tier_name_snapshot, total_hours_minutes (integer), used_hours_minutes (integer DEFAULT 0), price_paid_paise (integer), starts_at, expires_at, status (spa_membership_status enum DEFAULT 'active'), created_by (FK → user.id RESTRICT), invoice_id (FK nullable), notes, created_at, updated_at
    - Partial unique index: one active membership per customer — UNIQUE on (customer_id) WHERE status = 'active'
    - Indexes: spa_membership(expires_at) WHERE status = 'active', spa_membership(customer_id)
    - _Requirements: 9.1–9.4, 18.1–18.6_

- [x] 6. Create booking tables (depend on auth, branch, offer, membership)
  - [x] 6.1 Create `packages/db/src/schema/booking.ts` with booking, booking_service, booking_status_log, waitlist tables
    - `booking`: id (text PK nanoid), booking_number (UNIQUE), branch_id (FK → branch.id RESTRICT), customer_id (FK → user.id RESTRICT), status (booking_status enum DEFAULT 'pending'), booking_date (date), start_time (time), end_time (time), total_amount_paise (integer DEFAULT 0), total_duration_minutes (integer DEFAULT 0), notes, is_walkin (DEFAULT false), service_type (service_type enum), offer_id (FK → offer.id SET NULL nullable), is_membership_session (DEFAULT false), spa_membership_id (FK → spa_membership.id RESTRICT nullable), cancellation_reason, cancelled_at, rejection_reason, rejected_at, reschedule_count (DEFAULT 0), created_at, updated_at
    - `booking_service`: id (text PK nanoid), booking_id (FK → booking.id CASCADE), service_id (FK → service.id RESTRICT), staff_id (FK → staff_profile.id RESTRICT), service_name_snapshot (text NOT NULL), price_at_booking_paise (integer NOT NULL), duration_minutes (integer NOT NULL), display_order (DEFAULT 0)
    - `booking_status_log`: id (text PK nanoid), booking_id (FK → booking.id CASCADE), from_status (booking_status enum nullable), to_status (booking_status enum NOT NULL), changed_by (FK → user.id RESTRICT), notes, created_at
    - `waitlist`: id (text PK nanoid), customer_id (FK → user.id CASCADE), service_id (FK → service.id RESTRICT), preferred_staff_id (FK → staff_profile.id nullable), preferred_date, preferred_time_start (time nullable), preferred_time_end (time nullable), status (waitlist_status enum DEFAULT 'waiting'), notified_at, created_at
    - Indexes: booking(booking_date), booking(customer_id), booking(branch_id, booking_date), booking(service_type, booking_date), booking(status) partial WHERE status NOT IN ('completed','cancelled','no_show'), booking(offer_id) partial WHERE offer_id IS NOT NULL, booking(spa_membership_id) partial WHERE spa_membership_id IS NOT NULL, booking_service(staff_id)
    - _Requirements: 7.1–7.5, 18.1–18.6_

- [x] 7. Create invoice tables (depend on booking)
  - [x] 7.1 Create `packages/db/src/schema/invoice.ts` with invoice, invoice_item tables
    - `invoice`: id (text PK nanoid), invoice_number (UNIQUE), branch_id (FK → branch.id RESTRICT), booking_id (FK → booking.id RESTRICT), customer_id (FK → user.id RESTRICT), subtotal_paise (integer), discount_amount_paise (integer DEFAULT 0), taxable_value_paise (integer DEFAULT 0), gst_amount_paise (integer DEFAULT 0), total_amount_paise (integer), invoice_type (invoice_type enum DEFAULT 'service'), payment_method (payment_method enum DEFAULT 'cash'), payment_status (payment_status enum DEFAULT 'pending'), payment_reference, gems_earned (integer DEFAULT 0), gems_redeemed (integer DEFAULT 0), gems_redeemed_service_id (FK → service.id RESTRICT nullable), pdf_url, notes, paid_at, created_at, updated_at
    - `invoice_item`: id (text PK nanoid), invoice_id (FK → invoice.id CASCADE), service_id (FK → service.id RESTRICT), service_name_snapshot (text NOT NULL), staff_name_snapshot (text NOT NULL), quantity (integer DEFAULT 1), unit_price_paise (integer NOT NULL), total_price_paise (integer NOT NULL), display_order (DEFAULT 0)
    - Indexes: invoice(customer_id), invoice(branch_id), invoice(paid_at) partial WHERE payment_status = 'paid'
    - _Requirements: 8.1–8.3, 18.1–18.6_

- [x] 8. Create lead, CRM, loyalty, and notification tables (depend on auth, booking, invoice)
  - [x] 8.1 Create `packages/db/src/schema/lead.ts` with lead, lead_note tables
    - `lead`: id (text PK nanoid), name, phone, email, service_interested_id (FK → service.id SET NULL nullable), status (lead_status enum DEFAULT 'new'), source (DEFAULT 'meta_ad'), utm_campaign, utm_medium, utm_source, utm_content, utm_term, assigned_to (FK → user.id SET NULL nullable), converted_booking_id (FK → booking.id SET NULL nullable), last_contacted_at, created_at, updated_at
    - `lead_note`: id (text PK nanoid), lead_id (FK → lead.id CASCADE), author_id (FK → user.id RESTRICT), content, created_at
    - Indexes: lead(status), lead(assigned_to) partial WHERE status NOT IN ('won','lost'), lead(utm_campaign) partial WHERE utm_campaign IS NOT NULL
    - _Requirements: 11.1–11.3, 18.1–18.6_

  - [x] 8.2 Create `packages/db/src/schema/crm.ts` with customer_tag, customer_tag_assignment, customer_note tables
    - `customer_tag`: id (text PK nanoid), name, slug (UNIQUE), color, description, created_at
    - `customer_tag_assignment`: composite PK (customer_id, tag_id), customer_id (FK → user.id CASCADE), tag_id (FK → customer_tag.id CASCADE), assigned_by (FK → user.id RESTRICT), assigned_at (DEFAULT now())
    - `customer_note`: id (text PK nanoid), customer_id (FK → user.id CASCADE), author_id (FK → user.id RESTRICT), booking_id (FK → booking.id SET NULL nullable), content, created_at
    - Indexes: customer_tag_assignment(tag_id), customer_note(booking_id) partial WHERE booking_id IS NOT NULL
    - _Requirements: 12.1–12.4, 18.1–18.6_

  - [x] 8.3 Create `packages/db/src/schema/loyalty.ts` with loyalty_account, loyalty_transaction tables
    - `loyalty_account`: id (text PK nanoid), customer_id (UNIQUE FK → user.id CASCADE), gems_balance (integer DEFAULT 0), total_gems_earned (integer DEFAULT 0), total_gems_redeemed (integer DEFAULT 0), created_at, updated_at
    - `loyalty_transaction`: id (text PK nanoid), loyalty_account_id (FK → loyalty_account.id RESTRICT), type (loyalty_tx_type enum), gems_amount (integer), invoice_id (FK → invoice.id RESTRICT nullable), description, expires_at (nullable), created_at
    - Indexes: loyalty_transaction(loyalty_account_id, created_at DESC), loyalty_transaction(expires_at) partial WHERE type = 'earned' AND expires_at IS NOT NULL
    - _Requirements: 13.1–13.3, 18.1–18.6_

  - [x] 8.4 Create `packages/db/src/schema/notification.ts` with notification, push_subscription tables
    - `notification`: id (text PK nanoid), user_id (FK → user.id CASCADE), booking_id (FK → booking.id SET NULL nullable), type (notification_type enum), title, body, channel (notification_channel enum), status (notification_status enum DEFAULT 'pending'), sent_at, created_at
    - `push_subscription`: id (text PK nanoid), user_id (FK → user.id CASCADE), endpoint, p256dh_key, auth_key, is_active (DEFAULT true), created_at, updated_at
    - Indexes: notification(status, created_at) partial WHERE status = 'pending', push_subscription(user_id) partial WHERE is_active = true
    - _Requirements: 14.1–14.3, 18.1–18.6_

- [x] 9. Create system tables (depend on branch, auth)
  - [x] 9.1 Create `packages/db/src/schema/system.ts` with daily_sales_summary, monthly_gst_summary, audit_log, system_setting tables
    - `daily_sales_summary`: id (text PK nanoid), date, branch_id (FK → branch.id RESTRICT), total_bookings (DEFAULT 0), completed_bookings (DEFAULT 0), cancelled_bookings (DEFAULT 0), no_show_bookings (DEFAULT 0), walkin_bookings (DEFAULT 0), total_revenue_paise (DEFAULT 0), cash_revenue_paise (DEFAULT 0), upi_revenue_paise (DEFAULT 0), card_revenue_paise (DEFAULT 0), online_revenue_paise (DEFAULT 0), discount_given_paise (DEFAULT 0), gems_redeemed_count (DEFAULT 0), new_customers (DEFAULT 0), created_at, UNIQUE composite on (date, branch_id)
    - `monthly_gst_summary`: id (text PK nanoid), month (UNIQUE), taxable_value_paise (DEFAULT 0), gst_amount_paise (DEFAULT 0), invoice_count (DEFAULT 0), sac_code (DEFAULT '999721'), created_at
    - `audit_log`: id (text PK nanoid), actor_id (FK → user.id RESTRICT), action (audit_action enum), entity_type, entity_id, old_values (jsonb nullable), new_values (jsonb nullable), ip_address, created_at
    - `system_setting`: id (text PK nanoid), key (UNIQUE), value (jsonb), description, updated_by (FK → user.id SET NULL nullable), updated_at
    - Indexes: audit_log(entity_type, entity_id), audit_log(actor_id, created_at DESC)
    - _Requirements: 15.1–15.5, 18.1–18.6_

- [x] 10. Checkpoint - Verify all table definitions compile
  - Ensure all 15 schema files have no TypeScript errors individually before proceeding to relations.
  - Run `bunx tsc --noEmit` from `packages/db/` to catch import/type issues early.
  - Ask the user if questions arise.

- [x] 11. Create all relation files
  - [x] 11.1 Create `packages/db/src/schema/relations/auth.relations.ts`
    - Define `userRelations`: has one customerProfile, has one staffProfile, has many sessions, has many accounts, has many bookings (as customer), has many notifications, has many leadNotes (as author), has many customerNotes (as author), has many bookingStatusLogs (as changedBy)
    - Define `sessionRelations`: belongs to user
    - Define `accountRelations`: belongs to user
    - _Requirements: 16.1–16.4_

  - [x] 11.2 Create `packages/db/src/schema/relations/profile.relations.ts`
    - Define `customerProfileRelations`: belongs to user, has one loyaltyAccount
    - Define `staffProfileRelations`: belongs to user, has many staffServices, has many staffSchedules, has many staffTimeOffs, has many bookingServices (as assigned staff)
    - _Requirements: 16.1–16.4_

  - [x] 11.3 Create `packages/db/src/schema/relations/branch.relations.ts`
    - Define `branchRelations`: belongs to user (createdBy), has many bookings, has many invoices, has many dailySalesSummaries
    - _Requirements: 16.1–16.4_

  - [x] 11.4 Create `packages/db/src/schema/relations/service.relations.ts`
    - Define `serviceCategoryRelations`: has many services
    - Define `serviceRelations`: belongs to serviceCategory, has many staffServices, has many bookingServices, has many offerServices, has many invoiceItems
    - Define `staffServiceRelations`: belongs to staffProfile, belongs to service
    - _Requirements: 16.1–16.4_

  - [x] 11.5 Create `packages/db/src/schema/relations/schedule.relations.ts`
    - Define `staffScheduleRelations`: belongs to staffProfile
    - Define `staffTimeOffRelations`: belongs to staffProfile, belongs to user (reviewedBy)
    - _Requirements: 16.1–16.4_

  - [x] 11.6 Create `packages/db/src/schema/relations/booking.relations.ts`
    - Define `bookingRelations`: belongs to user (customer), belongs to branch, belongs to offer, belongs to spaMembership, has many bookingServices, has many bookingStatusLogs, has one invoice, has many notifications, has one offerRedemption
    - Define `bookingServiceRelations`: belongs to booking, belongs to service, belongs to staffProfile
    - Define `bookingStatusLogRelations`: belongs to booking, belongs to user (changedBy)
    - Define `waitlistRelations`: belongs to user (customer), belongs to service, belongs to staffProfile (preferredStaff)
    - _Requirements: 16.1–16.4_

  - [x] 11.7 Create `packages/db/src/schema/relations/invoice.relations.ts`
    - Define `invoiceRelations`: belongs to branch, belongs to booking, belongs to user (customer), belongs to service (gemsRedeemedService), has many invoiceItems, has one loyaltyTransaction
    - Define `invoiceItemRelations`: belongs to invoice, belongs to service
    - _Requirements: 16.1–16.4_

  - [x] 11.8 Create `packages/db/src/schema/relations/membership.relations.ts`
    - Define `spaMembershipTierRelations`: has many spaMemberships
    - Define `spaMembershipRelations`: belongs to user (customer), belongs to spaMembershipTier, belongs to user (createdBy), belongs to invoice, has many bookings (membership sessions)
    - _Requirements: 16.1–16.4_

  - [x] 11.9 Create `packages/db/src/schema/relations/offer.relations.ts`
    - Define `offerRelations`: has many offerServices, has many offerRedemptions, has many bookings
    - Define `offerServiceRelations`: belongs to offer, belongs to service
    - Define `offerRedemptionRelations`: belongs to offer, belongs to user (customer), belongs to booking
    - _Requirements: 16.1–16.4_

  - [x] 11.10 Create `packages/db/src/schema/relations/lead.relations.ts`
    - Define `leadRelations`: belongs to service (serviceInterested), belongs to user (assignedTo), belongs to booking (convertedBooking), has many leadNotes
    - Define `leadNoteRelations`: belongs to lead, belongs to user (author)
    - _Requirements: 16.1–16.4_

  - [x] 11.11 Create `packages/db/src/schema/relations/crm.relations.ts`
    - Define `customerTagRelations`: has many customerTagAssignments
    - Define `customerTagAssignmentRelations`: belongs to user (customer), belongs to customerTag, belongs to user (assignedBy)
    - Define `customerNoteRelations`: belongs to user (customer), belongs to user (author), belongs to booking
    - _Requirements: 16.1–16.4_

  - [x] 11.12 Create `packages/db/src/schema/relations/loyalty.relations.ts`
    - Define `loyaltyAccountRelations`: belongs to user (customer), has many loyaltyTransactions
    - Define `loyaltyTransactionRelations`: belongs to loyaltyAccount, belongs to invoice
    - _Requirements: 16.1–16.4_

  - [x] 11.13 Create `packages/db/src/schema/relations/notification.relations.ts`
    - Define `notificationRelations`: belongs to user, belongs to booking
    - Define `pushSubscriptionRelations`: belongs to user
    - _Requirements: 16.1–16.4_

  - [x] 11.14 Create `packages/db/src/schema/relations/system.relations.ts`
    - Define `dailySalesSummaryRelations`: belongs to branch
    - Define `auditLogRelations`: belongs to user (actor)
    - Define `systemSettingRelations`: belongs to user (updatedBy)
    - _Requirements: 16.1–16.4_

- [x] 12. Create barrel files and install dependencies
  - [x] 12.1 Create `packages/db/src/schema/relations/index.ts` barrel file
    - Re-export all 14 relation files using `export * from './auth.relations'` pattern
    - _Requirements: 17.2_

  - [x] 12.2 Create `packages/db/src/schema/index.ts` barrel file
    - Re-export all 15 schema domain files (enums + 14 domain tables)
    - Re-export all relations via `export * from './relations'`
    - _Requirements: 17.1–17.3_

  - [x] 12.3 Install nanoid dependency and verify package.json
    - Run `bun add nanoid` in `packages/db/`
    - Ensure `drizzle-orm` and `drizzle-kit` are in dependencies
    - Ensure `@neondatabase/serverless` is in dependencies
    - _Requirements: 18.1_

- [x] 13. Final checkpoint - Full typecheck verification
  - Run `bunx tsc --noEmit` from `packages/db/` — must pass with zero errors
  - Verify all 38 tables are exported from `packages/db/src/schema/index.ts`
  - Verify all relation files compile without circular import issues
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 18.7_

## Notes

- All schema files use TypeScript strict mode — no `any`, no `@ts-ignore`
- No property-based tests needed — schema definitions are declarative configuration verified by the TypeScript compiler
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before proceeding to dependent tasks
- Forward references between tables (e.g., offer_redemption → booking) use Drizzle's lazy reference pattern: `references(() => booking.id)`
- The `sql` import from `drizzle-orm` is needed for partial index WHERE clauses
- All monetary columns use `integer` type storing paise (₹1 = 100 paise)
- All timestamps use `timestamp('col', { withTimezone: true, mode: 'date' })`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9", "11.10", "11.11", "11.12", "11.13", "11.14"] },
    { "id": 10, "tasks": ["12.1", "12.2", "12.3"] }
  ]
}
```
