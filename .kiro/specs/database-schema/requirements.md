# Requirements Document

## Introduction

This spec covers Phase 1.1 of the Royal Glow Salon & Spa project: defining the complete PostgreSQL database schema using Drizzle ORM. It includes all 38 table definitions across 15 domain files, all PostgreSQL enums, indexes, constraints, relations in separate files, and a barrel file for aggregated exports. The schema follows Option B architecture — pgTable definitions in domain files, relations in a `schema/relations/` subfolder, aggregated through `schema/index.ts`.

## Glossary

- **Schema_Module**: A TypeScript file in `packages/db/src/schema/` that exports Drizzle ORM pgTable definitions for a specific domain (e.g., auth, booking, invoice).
- **Enum_Definition**: A PostgreSQL native enum type defined via `pgEnum` from `drizzle-orm/pg-core` in the `enums.ts` file.
- **Relation_File**: A TypeScript file in `packages/db/src/schema/relations/` that defines Drizzle ORM `relations()` for tables in the corresponding domain file.
- **Barrel_File**: The `schema/index.ts` file that re-exports all table definitions and relation definitions from all schema and relation files.
- **Drizzle_ORM**: The TypeScript ORM used for type-safe schema definitions and query building.
- **Nanoid**: A library for generating compact, URL-safe unique IDs used as primary keys.
- **Paise**: The smallest unit of Indian Rupee (1/100th of ₹), used for all monetary storage to avoid floating-point issues.
- **Snapshot_Column**: A column that freezes a value (e.g., service name, price) at the time of record creation so historical data remains accurate even if the source changes.
- **Junction_Table**: A table with a composite primary key linking two entities in a many-to-many relationship.
- **Composite_Index**: A database index spanning multiple columns for optimizing multi-column query patterns.
- **Partial_Index**: A database index with a WHERE clause that only indexes rows matching a condition.

## Requirements

### Requirement 1: PostgreSQL Enum Definitions

**User Story:** As a developer, I want all PostgreSQL enums defined in a single `enums.ts` file using Drizzle's `pgEnum`, so that type safety is enforced at the database level and enums are reusable across schema files.

#### Acceptance Criteria

1. THE Schema_Module SHALL export all 17 PostgreSQL enum definitions using `pgEnum` from `drizzle-orm/pg-core` in `packages/db/src/schema/enums.ts`.
2. THE Enum_Definition for `booking_status` SHALL contain exactly the values: pending, confirmed, rejected, in_progress, completed, cancelled, no_show, rescheduled.
3. THE Enum_Definition for `lead_status` SHALL contain exactly the values: new, contacted, follow_up, booked, won, lost.
4. THE Enum_Definition for `payment_status` SHALL contain exactly the values: pending, paid, refunded.
5. THE Enum_Definition for `payment_method` SHALL contain exactly the values: cash, upi, card, online.
6. THE Enum_Definition for `waitlist_status` SHALL contain exactly the values: waiting, notified, booked, expired, cancelled.
7. THE Enum_Definition for `notification_type` SHALL contain all 26 notification type values as specified in the database schema document.
8. THE Enum_Definition for `notification_channel` SHALL contain exactly the values: push, email.
9. THE Enum_Definition for `notification_status` SHALL contain exactly the values: pending, sent, failed.
10. THE Enum_Definition for `loyalty_tx_type` SHALL contain exactly the values: earned, redeemed, expired, adjusted.
11. THE Enum_Definition for `staff_designation` SHALL contain exactly the values: receptionist, stylist, therapist, manager.
12. THE Enum_Definition for `gender` SHALL contain exactly the values: male, female, other, prefer_not_to_say.
13. THE Enum_Definition for `audit_action` SHALL contain exactly the values: create, update, delete, status_change.
14. THE Enum_Definition for `service_type` SHALL contain exactly the values: salon, spa.
15. THE Enum_Definition for `discount_type` SHALL contain exactly the values: percentage, flat, combo_price.
16. THE Enum_Definition for `spa_membership_status` SHALL contain exactly the values: active, expired, cancelled.
17. THE Enum_Definition for `invoice_type` SHALL contain exactly the values: service, membership_purchase, membership_session.
18. THE Enum_Definition for `leave_approval_status` SHALL contain exactly the values: pending, approved, rejected.
19. THE Enum_Definition for `leave_type` SHALL contain exactly the values: sick, casual, personal, other.
20. THE Enum_Definition for `branch_status` SHALL contain exactly the values: operational, temporarily_closed, opens_soon, shutdown.

### Requirement 2: Auth Tables (Better Auth)

**User Story:** As a developer, I want the Better Auth tables (user, session, account, verification) defined in Drizzle ORM, so that the authentication system has a properly typed schema to read and write against.

#### Acceptance Criteria

1. THE Schema_Module `auth.ts` SHALL export a `user` table with columns: id (text PK), name (text NOT NULL), email (text NOT NULL UNIQUE), email_verified (boolean NOT NULL), image (text nullable), role (text nullable), banned (boolean DEFAULT false), ban_reason (text nullable), ban_expires (timestamptz nullable), created_at (timestamptz NOT NULL), updated_at (timestamptz NOT NULL).
2. THE Schema_Module `auth.ts` SHALL export a `session` table with columns: id (text PK), user_id (text NOT NULL FK → user.id), expires_at (timestamptz NOT NULL), token (text NOT NULL UNIQUE), ip_address (text nullable), user_agent (text nullable), created_at (timestamptz NOT NULL), updated_at (timestamptz NOT NULL).
3. THE Schema_Module `auth.ts` SHALL export an `account` table with columns: id (text PK), user_id (text NOT NULL FK → user.id), account_id (text NOT NULL), provider_id (text NOT NULL), access_token (text nullable), refresh_token (text nullable), id_token (text nullable), access_token_expires_at (timestamptz nullable), refresh_token_expires_at (timestamptz nullable), scope (text nullable), password (text nullable), created_at (timestamptz NOT NULL), updated_at (timestamptz NOT NULL).
4. THE Schema_Module `auth.ts` SHALL export a `verification` table with columns: id (text PK), identifier (text NOT NULL), value (text NOT NULL), expires_at (timestamptz NOT NULL), created_at (timestamptz nullable), updated_at (timestamptz nullable).
5. WHEN defining foreign keys in auth tables, THE Schema_Module SHALL use ON DELETE CASCADE for session and account references to user.

### Requirement 3: Profile Tables

**User Story:** As a developer, I want customer and staff profile tables defined with all denormalized counters and preference fields, so that the application can efficiently query customer lifetime data and staff capabilities.

#### Acceptance Criteria

1. THE Schema_Module `profile.ts` SHALL export a `customer_profile` table with all 24 columns as specified: id, user_id (UNIQUE FK CASCADE), phone, gender (enum), date_of_birth, marketing_consent (DEFAULT false), marketing_consent_at, appointment_reminders_enabled (DEFAULT true), membership_alerts_enabled (DEFAULT true), acquisition_source, utm_campaign, utm_medium, utm_source, first_visit_at, last_visit_at, total_visits (DEFAULT 0), total_spent_paise (DEFAULT 0), noshow_count (DEFAULT 0), late_cancellation_count (DEFAULT 0), consecutive_completed_bookings (DEFAULT 0), booking_requires_approval (DEFAULT false), created_at, updated_at.
2. THE Schema_Module `profile.ts` SHALL export a `staff_profile` table with all 10 columns as specified: id, user_id (UNIQUE FK CASCADE), phone, designation (staff_designation enum NOT NULL), bio, specialization, is_active (DEFAULT true), hire_date, created_at, updated_at.
3. THE Schema_Module SHALL define an index on `customer_profile.user_id` and `staff_profile.user_id` for foreign key lookups.

### Requirement 4: Branch Table

**User Story:** As a developer, I want the branch table defined with location data, status tracking, and unique constraints on number and code, so that multi-branch operations are supported from day one.

#### Acceptance Criteria

1. THE Schema_Module `branch.ts` SHALL export a `branch` table with all 23 columns as specified: id, number (integer UNIQUE), code (text UNIQUE), name, address_line1, address_line2, city (DEFAULT 'Bengaluru'), state (DEFAULT 'Karnataka'), pincode, phone, email, google_maps_url, google_maps_place_id, latitude (numeric(10,7)), longitude (numeric(10,7)), status (branch_status DEFAULT 'operational'), opening_date, closing_date, temporary_close_reason, is_primary (DEFAULT false), display_order (DEFAULT 0), created_by (FK → user.id ON DELETE RESTRICT nullable), created_at, updated_at.

### Requirement 5: Service Tables

**User Story:** As a developer, I want service category, service, and staff-service junction tables defined with proper constraints and gems catalogue support, so that the service catalog and staff assignment features have a typed data layer.

#### Acceptance Criteria

1. THE Schema_Module `service.ts` SHALL export a `service_category` table with columns: id, name, slug (UNIQUE), description, service_type (enum NOT NULL), display_order (DEFAULT 0), is_active (DEFAULT true), created_at, updated_at.
2. THE Schema_Module `service.ts` SHALL export a `service` table with columns: id, category_id (FK RESTRICT), name, slug (UNIQUE), description, duration_minutes, buffer_minutes (DEFAULT 0), price_paise, is_active (DEFAULT true), image_url, display_order (DEFAULT 0), gems_redeemable (DEFAULT false), gems_required (nullable), gems_catalogue_order (nullable), created_at, updated_at.
3. THE Schema_Module `service.ts` SHALL export a `staff_service` Junction_Table with composite primary key (staff_id, service_id) and CASCADE deletes on both foreign keys.
4. THE Schema_Module SHALL define an index on `service.category_id` for foreign key lookups.
5. THE Schema_Module SHALL define a Partial_Index on `service` for the gems catalogue: `WHERE gems_redeemable = true AND is_active = true` ordered by `gems_catalogue_order`.

### Requirement 6: Schedule Tables

**User Story:** As a developer, I want staff schedule, time-off, business hours, and holiday tables defined with proper unique constraints, so that the availability engine can compute open slots accurately.

#### Acceptance Criteria

1. THE Schema_Module `schedule.ts` SHALL export a `staff_schedule` table with columns: id, staff_id (FK CASCADE), day_of_week (integer), start_time (time nullable), end_time (time nullable), is_working (DEFAULT true), with a UNIQUE constraint on (staff_id, day_of_week).
2. THE Schema_Module `schedule.ts` SHALL export a `staff_time_off` table with columns: id, staff_id (FK CASCADE), leave_type (enum DEFAULT 'personal'), date, reason, approval_status (enum DEFAULT 'pending'), reviewed_by (FK nullable), reviewed_at, rejection_reason, created_at, updated_at, with a UNIQUE constraint on (staff_id, date).
3. THE Schema_Module `schedule.ts` SHALL export a `business_hour` table with columns: id, day_of_week (integer UNIQUE), open_time (time nullable), close_time (time nullable), is_open (DEFAULT true).
4. THE Schema_Module `schedule.ts` SHALL export a `holiday` table with columns: id, date (UNIQUE), name, created_at.
5. THE Schema_Module SHALL define indexes on `staff_schedule(staff_id, day_of_week)` and `staff_time_off(staff_id, date)` for availability lookups.

### Requirement 7: Booking Tables

**User Story:** As a developer, I want booking, booking_service, booking_status_log, and waitlist tables defined with all business rule constraints and snapshot columns, so that the booking lifecycle is fully represented in the data layer.

#### Acceptance Criteria

1. THE Schema_Module `booking.ts` SHALL export a `booking` table with all 23 columns as specified: id, booking_number (UNIQUE), branch_id (FK RESTRICT), customer_id (FK RESTRICT), status (enum DEFAULT 'pending'), booking_date, start_time, end_time, total_amount_paise, total_duration_minutes, notes, is_walkin (DEFAULT false), service_type (enum), offer_id (FK SET NULL nullable), is_membership_session (DEFAULT false), spa_membership_id (FK RESTRICT nullable), cancellation_reason, cancelled_at, rejection_reason, rejected_at, reschedule_count (DEFAULT 0), created_at, updated_at.
2. THE Schema_Module `booking.ts` SHALL export a `booking_service` table with Snapshot_Columns: id, booking_id (FK CASCADE), service_id (FK RESTRICT), staff_id (FK RESTRICT), service_name_snapshot, price_at_booking_paise, duration_minutes, display_order (DEFAULT 0).
3. THE Schema_Module `booking.ts` SHALL export a `booking_status_log` table with columns: id, booking_id (FK CASCADE), from_status (enum nullable), to_status (enum NOT NULL), changed_by (FK RESTRICT), notes, created_at.
4. THE Schema_Module `booking.ts` SHALL export a `waitlist` table with columns: id, customer_id (FK CASCADE), service_id (FK RESTRICT), preferred_staff_id (FK nullable), preferred_date, preferred_time_start (nullable), preferred_time_end (nullable), status (enum DEFAULT 'waiting'), notified_at, created_at.
5. THE Schema_Module SHALL define indexes for: booking(booking_date), booking(customer_id), booking(status) partial, booking(branch_id, booking_date), booking(offer_id) partial, booking(spa_membership_id) partial, booking(service_type, booking_date), and booking_service(staff_id).

### Requirement 8: Invoice Tables

**User Story:** As a developer, I want invoice and invoice_item tables defined with GST fields, payment tracking, gems columns, and snapshot columns, so that billing records are complete and historically accurate.

#### Acceptance Criteria

1. THE Schema_Module `invoice.ts` SHALL export an `invoice` table with all 23 columns as specified: id, invoice_number (UNIQUE), branch_id (FK RESTRICT), booking_id (FK RESTRICT), customer_id (FK RESTRICT), subtotal_paise, discount_amount_paise (DEFAULT 0), taxable_value_paise (DEFAULT 0), gst_amount_paise (DEFAULT 0), total_amount_paise, invoice_type (enum DEFAULT 'service'), payment_method (enum DEFAULT 'cash'), payment_status (enum DEFAULT 'pending'), payment_reference, gems_earned (DEFAULT 0), gems_redeemed (DEFAULT 0), gems_redeemed_service_id (FK RESTRICT nullable), pdf_url, notes, paid_at, created_at, updated_at.
2. THE Schema_Module `invoice.ts` SHALL export an `invoice_item` table with Snapshot_Columns: id, invoice_id (FK CASCADE), service_id (FK RESTRICT), service_name_snapshot, staff_name_snapshot, quantity (DEFAULT 1), unit_price_paise, total_price_paise, display_order (DEFAULT 0).
3. THE Schema_Module SHALL define indexes for: invoice(customer_id), invoice(branch_id), invoice(paid_at) partial where payment_status = 'paid'.

### Requirement 9: Membership Tables

**User Story:** As a developer, I want spa_membership_tier and spa_membership tables defined with hour tracking, status constraints, and the one-active-per-customer unique index, so that the SPA membership system enforces business rules at the database level.

#### Acceptance Criteria

1. THE Schema_Module `membership.ts` SHALL export a `spa_membership_tier` table with columns: id, name (UNIQUE), slug (UNIQUE), description, default_hours_minutes, default_price_paise, default_validity_days, is_active (DEFAULT true), display_order (DEFAULT 0), created_at, updated_at.
2. THE Schema_Module `membership.ts` SHALL export a `spa_membership` table with columns: id, membership_number (UNIQUE), customer_id (FK RESTRICT), tier_id (FK RESTRICT), tier_name_snapshot, total_hours_minutes, used_hours_minutes (DEFAULT 0), price_paid_paise, starts_at, expires_at, status (enum DEFAULT 'active'), created_by (FK RESTRICT), invoice_id (FK RESTRICT nullable), notes, created_at, updated_at.
3. THE Schema_Module SHALL define a Partial_Index enforcing one active membership per customer: UNIQUE on (customer_id) WHERE status = 'active'.
4. THE Schema_Module SHALL define an index on `spa_membership(expires_at)` WHERE status = 'active' for the expiry cron job, and an index on `spa_membership(customer_id)` for membership history lookups.

### Requirement 10: Offer Tables

**User Story:** As a developer, I want offer, offer_service, and offer_redemption tables defined with discount type constraints and the one-offer-per-customer-per-day unique constraint, so that promotional rules are enforced at the database level.

#### Acceptance Criteria

1. THE Schema_Module `offer.ts` SHALL export an `offer` table with columns: id, name, slug (UNIQUE), description, offer_type (discount_type enum), discount_percentage (nullable), discount_amount_paise (nullable), combo_price_paise (nullable), start_date, end_date, is_active (DEFAULT true), terms, image_url, display_order (DEFAULT 0), created_at, updated_at.
2. THE Schema_Module `offer.ts` SHALL export an `offer_service` Junction_Table with composite primary key (offer_id, service_id) and CASCADE deletes on both foreign keys.
3. THE Schema_Module `offer.ts` SHALL export an `offer_redemption` table with columns: id, offer_id (FK RESTRICT), customer_id (FK RESTRICT), booking_id (FK RESTRICT), redeemed_date, created_at, with a UNIQUE constraint on (customer_id, redeemed_date).
4. THE Schema_Module SHALL define indexes for: offer(display_order) partial where is_active = true, offer_redemption(customer_id, redeemed_date), offer_redemption(offer_id).

### Requirement 11: Lead Tables

**User Story:** As a developer, I want lead and lead_note tables defined with UTM tracking and pipeline status, so that the Meta ad lead pipeline is fully represented in the data layer.

#### Acceptance Criteria

1. THE Schema_Module `lead.ts` SHALL export a `lead` table with columns: id, name, phone, email, service_interested_id (FK SET NULL nullable), status (enum DEFAULT 'new'), source (DEFAULT 'meta_ad'), utm_campaign, utm_medium, utm_source, utm_content, utm_term, assigned_to (FK SET NULL nullable), converted_booking_id (FK SET NULL nullable), last_contacted_at, created_at, updated_at.
2. THE Schema_Module `lead.ts` SHALL export a `lead_note` table with columns: id, lead_id (FK CASCADE), author_id (FK RESTRICT), content, created_at.
3. THE Schema_Module SHALL define indexes for: lead(status), lead(assigned_to) partial where status NOT IN ('won', 'lost'), lead(utm_campaign) partial where utm_campaign IS NOT NULL.

### Requirement 12: CRM Tables

**User Story:** As a developer, I want customer_tag, customer_tag_assignment, and customer_note tables defined, so that the CRM tagging and notes system has a typed data layer.

#### Acceptance Criteria

1. THE Schema_Module `crm.ts` SHALL export a `customer_tag` table with columns: id, name, slug (UNIQUE), color, description, created_at.
2. THE Schema_Module `crm.ts` SHALL export a `customer_tag_assignment` Junction_Table with composite primary key (customer_id, tag_id), CASCADE deletes on both FKs, plus assigned_by (FK RESTRICT) and assigned_at (DEFAULT now()).
3. THE Schema_Module `crm.ts` SHALL export a `customer_note` table with columns: id, customer_id (FK CASCADE), author_id (FK RESTRICT), booking_id (FK SET NULL nullable), content, created_at.
4. THE Schema_Module SHALL define indexes for: customer_tag_assignment(tag_id), customer_note(booking_id) partial where booking_id IS NOT NULL.

### Requirement 13: Loyalty Tables

**User Story:** As a developer, I want loyalty_account and loyalty_transaction tables defined with balance tracking and expiry support, so that the gems system can track earning, redemption, and expiration.

#### Acceptance Criteria

1. THE Schema_Module `loyalty.ts` SHALL export a `loyalty_account` table with columns: id, customer_id (UNIQUE FK CASCADE), gems_balance (DEFAULT 0), total_gems_earned (DEFAULT 0), total_gems_redeemed (DEFAULT 0), created_at, updated_at.
2. THE Schema_Module `loyalty.ts` SHALL export a `loyalty_transaction` table with columns: id, loyalty_account_id (FK RESTRICT), type (enum), gems_amount, invoice_id (FK RESTRICT nullable), description, expires_at (nullable), created_at.
3. THE Schema_Module SHALL define indexes for: loyalty_transaction(loyalty_account_id, created_at DESC), loyalty_transaction(expires_at) partial where type = 'earned' AND expires_at IS NOT NULL.

### Requirement 14: Notification Tables

**User Story:** As a developer, I want notification and push_subscription tables defined, so that the notification delivery system can track subscriptions and delivery status.

#### Acceptance Criteria

1. THE Schema_Module `notification.ts` SHALL export a `notification` table with columns: id, user_id (FK CASCADE), booking_id (FK SET NULL nullable), type (enum), title, body, channel (enum), status (enum DEFAULT 'pending'), sent_at, created_at.
2. THE Schema_Module `notification.ts` SHALL export a `push_subscription` table with columns: id, user_id (FK CASCADE), endpoint, p256dh_key, auth_key, is_active (DEFAULT true), created_at, updated_at.
3. THE Schema_Module SHALL define indexes for: notification(status, created_at) partial where status = 'pending', push_subscription(user_id) partial where is_active = true.

### Requirement 15: System Tables

**User Story:** As a developer, I want daily_sales_summary, monthly_gst_summary, audit_log, and system_setting tables defined, so that reporting, auditing, and configuration have proper data structures.

#### Acceptance Criteria

1. THE Schema_Module `system.ts` SHALL export a `daily_sales_summary` table with all 17 columns as specified, including a UNIQUE composite index on (date, branch_id).
2. THE Schema_Module `system.ts` SHALL export a `monthly_gst_summary` table with columns: id, month (UNIQUE), taxable_value_paise (DEFAULT 0), gst_amount_paise (DEFAULT 0), invoice_count (DEFAULT 0), sac_code (DEFAULT '999721'), created_at.
3. THE Schema_Module `system.ts` SHALL export an `audit_log` table with columns: id, actor_id (FK RESTRICT), action (enum), entity_type, entity_id, old_values (jsonb nullable), new_values (jsonb nullable), ip_address, created_at.
4. THE Schema_Module `system.ts` SHALL export a `system_setting` table with columns: id, key (UNIQUE), value (jsonb), description, updated_by (FK SET NULL nullable), updated_at.
5. THE Schema_Module SHALL define indexes for: audit_log(entity_type, entity_id), audit_log(actor_id, created_at DESC).

### Requirement 16: Relation Definitions

**User Story:** As a developer, I want all Drizzle ORM relations defined in separate files under `schema/relations/`, so that the relational query API works correctly while keeping table definitions clean.

#### Acceptance Criteria

1. THE Relation_File for each domain SHALL define `relations()` for every table in the corresponding schema file, specifying one-to-one, one-to-many, and many-to-many relationships.
2. THE Relation_File SHALL import table references from the corresponding schema file and from other schema files as needed for cross-domain relations.
3. WHEN a table has foreign key columns, THE Relation_File SHALL define both the "belongs to" relation on the child table and the "has many" or "has one" relation on the parent table.
4. THE Relation_File set SHALL cover all 14 domains: auth, profile, service, schedule, booking, invoice, membership, offer, lead, crm, loyalty, notification, branch, system.

### Requirement 17: Barrel File Aggregation

**User Story:** As a developer, I want a single `schema/index.ts` barrel file that re-exports all tables and relations, so that consumers can import the full schema from one location.

#### Acceptance Criteria

1. THE Barrel_File `schema/index.ts` SHALL re-export all named exports from all 15 schema domain files.
2. THE Barrel_File SHALL re-export all named exports from all 14 relation files in the `relations/` subfolder.
3. WHEN a new schema or relation file is added, THE Barrel_File SHALL be updated to include the new exports.

### Requirement 18: Schema Conventions Compliance

**User Story:** As a developer, I want all schema definitions to follow the project's mandatory conventions, so that the codebase is consistent and the database behaves predictably.

#### Acceptance Criteria

1. THE Schema_Module SHALL use `text('id').primaryKey().$defaultFn(() => nanoid())` for all primary key columns.
2. THE Schema_Module SHALL use `integer` type in paise for all monetary columns with no floating-point types.
3. THE Schema_Module SHALL use `timestamp('column_name', { withTimezone: true, mode: 'date' })` for all timestamp columns.
4. THE Schema_Module SHALL use snake_case for all table and column names.
5. THE Schema_Module SHALL define explicit indexes on all foreign key columns.
6. THE Schema_Module SHALL use the appropriate `ON DELETE` action for each foreign key: CASCADE for child records, RESTRICT for referenced data, SET NULL for optional references.
7. THE Schema_Module SHALL pass TypeScript strict-mode type checking with no errors when compiled.
