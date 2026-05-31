# Requirements Document

## Introduction

Phase 4 delivers the customer-relationship layer of the Royal Glow Salon & Spa (RGSS) platform, built on top of the booking backend from Phase 3. It covers four cohesive areas: a marketing **Lead Pipeline** (cold Meta-ad capture → kanban management), **CRM** (customer directory and profiles with tags and notes), **SPA Memberships** (admin-created hour-based memberships with session recording), and a customer-facing **Loyalty (Gems)** view.

All four areas reuse the layered architecture already established: API routes are thin orchestrators (parse → Zod validate → call business logic / query layer → return the standard envelope), business rules are pure functions in `packages/business` that throw `AppError`, and all database access is isolated in `packages/db/queries`. Every response conforms to the single envelope shape and every route is wrapped with `withErrorHandler()`. The nine underlying tables already exist in the schema and are pushed to Neon, so this phase is additive and requires no migrations.

Out of scope for this phase (deferred to later phases): Meta Pixel / CAPI events, automatic CRM tag assignment via background jobs, membership expiry reminders and auto-expiry, gems redemption at checkout (write path), and email delivery internals. Where these are side effects of an endpoint, the API exposes an extension point but does not implement the external integration here.

## Glossary

- **Lead_Service**: The API and logic for capturing and persisting marketing leads (`/api/leads`).
- **Lead_Pipeline**: The admin endpoints and kanban UI for managing leads through their status lifecycle (`/admin/leads`).
- **Lead_Lifecycle**: The lead status state machine: `new → contacted → follow_up → booked → won/lost`, with the allowed transitions defined in the design.
- **Stale_Lead**: A lead in status `new` whose creation time is 48 hours or more in the past.
- **CRM_Service**: The admin endpoints and pages for the customer directory and per-customer profiles (`/admin/customers`).
- **Customer**: A `user` row with role `customer` that has an associated `customer_profile`.
- **Customer_Tag**: A label (manual in this phase) assignable to a customer for segmentation.
- **Membership_Service**: The admin endpoints and logic for creating SPA memberships and recording sessions (`/api/admin/memberships`).
- **Membership_Session**: A completed, ₹0 booking that deducts hours from an active membership and produces a `membership_session` invoice.
- **Membership_Number_Generator**: The pure function producing a membership number in the format `RG-MEM-{YY}-{branchNumber}-{5random}`.
- **Loyalty_Service**: The customer-facing endpoint and page exposing the gems balance, history, and redeemable catalogue (`/api/gems`, `/gems`).
- **Standard_Envelope**: The response contract — `{ success: true, data: T, meta? }` on success or `{ success: false, error: {...} }` on failure.
- **AppError**: The custom error class (`@rgss/errors`) carrying `code`, `statusCode`, `retryable`, and `details`.
- **Admin_User**: A user whose role is at least Receptionist in the RBAC hierarchy (customer < staff < receptionist < manager < owner < developer).
- **Authenticated_Customer**: A signed-in user with a valid session resolved via Better Auth.
- **Paise**: The integer money unit used throughout the system (₹1 = 100 paise).
- **GST**: Goods and Services Tax, 18% inclusive; base value back-calculated as `price / 1.18`.

## Requirements

### Requirement 1: Lead Capture

**User Story:** As a marketing operator, I want to capture leads from the campaign landing form, so that prospective customers from paid ads enter the sales pipeline.

#### Acceptance Criteria

1. WHEN a client submits a lead with a name, a phone number, and an optional service of interest, THE Lead_Service SHALL create a lead record with status `new` and return the lead identifier.
2. THE Lead_Service SHALL accept lead submissions without requiring authentication.
3. IF a lead submission contains a phone number that does not match the Indian mobile number format, THEN THE Lead_Service SHALL return a VALIDATION_ERROR with statusCode 400.
4. WHERE UTM attribution fields are supplied, THE Lead_Service SHALL store the UTM source, medium, campaign, content, and term on the lead record.
5. WHEN a lead is created through the public landing endpoint, THE Lead_Service SHALL set the source to `meta_ad` by default, and WHEN created through the admin manual-entry endpoint, THE Lead_Service SHALL set the source to `manual`.
6. THE Lead_Service SHALL store the phone number in a normalised canonical form.
7. WHEN the public lead landing page is served, THE Lead_Service page SHALL be excluded from search engine indexing.

### Requirement 2: Lead Pipeline Management

**User Story:** As an admin user, I want to view and manage leads through a status pipeline, so that I can follow up and convert prospects.

#### Acceptance Criteria

1. IF a client whose role is below Receptionist requests the lead pipeline, THEN THE Lead_Pipeline SHALL return a FORBIDDEN error with statusCode 403.
2. IF an Admin_User requests a lead status transition that is not permitted by the Lead_Lifecycle, THEN THE Lead_Pipeline SHALL return a CONFLICT (or BUSINESS_RULE_VIOLATION) error with statusCode 409.
3. IF an Admin_User transitions a lead to status `lost` without supplying a reason, THEN THE Lead_Pipeline SHALL return a VALIDATION_ERROR with statusCode 400.
4. WHEN the Lead_Pipeline returns leads, THE Lead_Pipeline SHALL indicate, for each lead, whether it is a Stale_Lead based on a 48-hour threshold from creation while still in status `new`.
5. WHEN an Admin_User adds a note to a lead, THE Lead_Pipeline SHALL persist the note with its author and timestamp.
6. WHEN an Admin_User requests a single lead by identifier, THE Lead_Pipeline SHALL return the lead with its attribution fields, notes, and any linked customer or converted booking.

### Requirement 3: Customer Directory

**User Story:** As an admin user, I want to search, filter, and sort the customer base, so that I can find and prioritise customers.

#### Acceptance Criteria

1. IF a client whose role is below Receptionist requests the customer directory, THEN THE CRM_Service SHALL return a FORBIDDEN error with statusCode 403.
2. WHEN an Admin_User searches the directory with a query, THE CRM_Service SHALL match customers by name, phone, or email case-insensitively.
3. WHERE a sort option is supplied, THE CRM_Service SHALL order results by the requested key (lifetime value, visits, last visit, name, gems, or no-shows).
4. WHEN the CRM_Service returns a directory page, THE CRM_Service SHALL include a `meta` object whose `totalCount` equals the number of customers matching the active filters and whose `totalPages` equals the ceiling of `totalCount / pageSize`.
5. WHERE a tag filter is supplied, THE CRM_Service SHALL return only customers assigned that tag.
6. WHEN an Admin_User requests a single customer profile, THE CRM_Service SHALL return the customer's KPIs (visits, lifetime value, no-shows, gems balance), tags, and contact details.

### Requirement 4: Customer Tagging and Notes

**User Story:** As an admin user, I want to tag customers and record notes, so that I can segment and remember context about each relationship.

#### Acceptance Criteria

1. WHEN an Admin_User assigns a tag to a customer, THE CRM_Service SHALL persist the assignment with the assigning user and timestamp.
2. WHEN an Admin_User removes a tag from a customer, THE CRM_Service SHALL delete that tag assignment.
3. IF an Admin_User assigns a tag that is already present on a customer, THEN THE CRM_Service SHALL leave exactly one assignment for that customer and tag and SHALL NOT error.
4. IF a client whose role is below Manager attempts to create a new tag, THEN THE CRM_Service SHALL return a FORBIDDEN error with statusCode 403.
5. WHEN an Admin_User adds a note to a customer, THE CRM_Service SHALL persist the note with its author and timestamp.

### Requirement 5: Membership Creation

**User Story:** As an admin user, I want to create a SPA membership for a customer, so that they can pre-purchase hours and the purchase is invoiced.

#### Acceptance Criteria

1. WHEN an Admin_User creates a membership for a customer with a tier, hours, price, start date, validity, and payment method, THE Membership_Service SHALL create a membership with status `active` and create a `membership_purchase` invoice.
2. WHEN a membership is created, THE Membership_Number_Generator SHALL produce a membership number matching the pattern `RG-MEM-{YY}-{branchNumber}-{5random}`, where `YY` is the two-digit year of the start date.
3. WHEN a membership is created, THE Membership_Service SHALL set the expiry to the start date plus the validity period in days.
4. IF an Admin_User creates a membership for a customer who already has an active membership, THEN THE Membership_Service SHALL return a MEMBERSHIP_ALREADY_ACTIVE error with statusCode 409.
5. WHEN a `membership_purchase` invoice is created, THE Membership_Service SHALL award zero gems.
6. WHEN a `membership_purchase` invoice is created, THE Membership_Service SHALL store the price as integer paise and set the taxable value and GST amount such that taxable value plus GST equals the total amount exactly.
7. IF a client whose role is below Receptionist attempts to create a membership, THEN THE Membership_Service SHALL return a FORBIDDEN error with statusCode 403.

### Requirement 6: Membership Session Recording

**User Story:** As an admin user, I want to record a session against a membership, so that the customer's hours are deducted and the session is documented at no charge.

#### Acceptance Criteria

1. WHEN an Admin_User records a session against an active membership, THE Membership_Service SHALL create a completed ₹0 booking flagged as a membership session, create a `membership_session` invoice, and increase the membership's used minutes by the session duration.
2. WHEN a session is recorded, THE Membership_Service SHALL ensure the membership's used minutes never exceed its total minutes.
3. IF an Admin_User records a session whose duration exceeds the remaining minutes, THEN THE Membership_Service SHALL return a MEMBERSHIP_INSUFFICIENT_HOURS error with statusCode 409; AND IF the membership is not active or is past its expiry, THEN THE Membership_Service SHALL return a MEMBERSHIP_EXPIRED error with statusCode 409.
4. WHEN a `membership_session` invoice is created, THE Membership_Service SHALL set the total to ₹0 and award zero gems.
5. IF a client whose role is below Manager attempts to cancel a membership, THEN THE Membership_Service SHALL return a FORBIDDEN error with statusCode 403.

### Requirement 7: Customer Membership View

**User Story:** As an authenticated customer, I want to view my SPA membership and session history, so that I can track my remaining hours and validity.

#### Acceptance Criteria

1. IF an unauthenticated client requests the membership view, THEN THE Membership_Service SHALL return an UNAUTHENTICATED error with statusCode 401.
2. WHEN an Authenticated_Customer requests their membership, THE Membership_Service SHALL return only memberships owned by that customer and SHALL NOT expose another customer's membership.
3. WHEN an Authenticated_Customer has an active membership, THE Membership_Service SHALL return its tier, membership number, used and remaining hours, and expiry date.
4. WHEN an Authenticated_Customer requests their membership, THE Membership_Service SHALL return the session history for that membership.
5. WHILE an active membership is within 30 days of expiry, THE customer membership view SHALL present an urgency state appropriate to the remaining days.

### Requirement 8: Customer Gems View

**User Story:** As an authenticated customer, I want to view my gems balance, history, and what I can redeem, so that I understand and use my loyalty rewards.

#### Acceptance Criteria

1. IF an unauthenticated client requests the gems view, THEN THE Loyalty_Service SHALL return an UNAUTHENTICATED error with statusCode 401.
2. WHEN an Authenticated_Customer requests their gems, THE Loyalty_Service SHALL return only the loyalty data owned by that customer and SHALL NOT expose another customer's data.
3. WHEN an Authenticated_Customer requests their gems, THE Loyalty_Service SHALL return the current gems balance, lifetime gems earned, and lifetime gems redeemed.
4. WHEN an Authenticated_Customer requests their gems, THE Loyalty_Service SHALL return the transaction history with each transaction's type, amount, date, and any associated invoice reference.
5. THE Loyalty_Service SHALL return the catalogue of services redeemable with gems, each with the gems required.

### Requirement 9: Standard Envelope, RBAC, and Navigation Consistency

**User Story:** As a frontend developer, I want every Phase 4 endpoint to follow the established response, error, and access-control conventions, so that the UI handles them uniformly.

#### Acceptance Criteria

1. WHEN any Phase 4 route handler returns successfully, THE handler SHALL produce a response body of the form `{ success: true, data: <result> }`, including a `meta` object where pagination applies.
2. WHEN any Phase 4 route handler throws an AppError, THE Error_Handler SHALL produce the standard error envelope with the AppError status code as the HTTP status and the request identifier echoed.
3. THE public lead capture endpoint SHALL be rate-limited to mitigate abuse, being the only unauthenticated write endpoint in this phase.
4. WHEN the authenticated customer navigation is rendered, THE navigation SHALL include links to the membership and gems views, AND THE public lead landing page SHALL NOT be linked from any site navigation.
