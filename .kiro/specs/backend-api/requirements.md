# Requirements Document

## Introduction

The Backend API feature delivers the API layer for the Royal Glow Salon & Spa (RGSS) platform. It connects the existing customer and admin UI (currently driven by hardcoded data) to the live Neon PostgreSQL database through a strict layered architecture.

The system follows the established RGSS architecture: API routes are thin orchestrators (parse → Zod validate → call business logic → return JSON), business rules live in `packages/business/` as pure functions that throw `AppError`, and all database access is isolated in `packages/db/queries/` using Drizzle ORM. Every response conforms to a single envelope shape, and every route is wrapped with `withErrorHandler()`.

This feature covers four layers built in priority order: the API foundation (error handler, response helpers, Zod schemas), the query layer, the business logic layer, customer-facing API routes, admin API routes, and finally the wiring of three existing UI surfaces (services page, booking dialog, admin bookings page) to the new endpoints.

Out of scope: background jobs (QStash/pg_cron), webhooks, realtime (Ably) publishing implementation, PDF generation internals, email delivery internals, and payment gateway integration. Where these are side effects of an endpoint, the API exposes an extension point but does not implement the external integration in this feature.

## Glossary

- **API_Foundation**: The shared library (`apps/web/src/lib/api/`) providing `withErrorHandler()` and response helpers used by every route.
- **Error_Handler**: The `withErrorHandler()` wrapper that catches errors and serialises them into the standard error envelope.
- **Response_Helper**: The `apiSuccess()` and related functions that serialise successful results into the standard success envelope.
- **Query_Layer**: Drizzle query builder functions in `packages/db/queries/` that read from and write to the database.
- **Business_Layer**: Pure functions in `packages/business/` that enforce business rules and throw `AppError`.
- **Booking_Service**: The API and business logic responsible for creating, reading, cancelling, and rescheduling bookings.
- **Availability_Service**: The logic that computes bookable time slots for a date and branch.
- **Booking_Number_Generator**: The pure function that produces a booking number in the format `BK-{branchCode}-{YYMM}-{H|S}-{5random}`.
- **Services_API**: The endpoints serving the service catalogue (`/api/services`, `/api/services/[slug]`).
- **Lead_Service**: The endpoint and logic for capturing marketing leads (`/api/leads`).
- **Admin_Booking_Service**: The admin endpoints for listing, approving, rejecting, assigning, and completing bookings.
- **Standard_Envelope**: The response contract — `{ success: true, data: T, meta? }` on success or `{ success: false, error: {...} }` on failure.
- **AppError**: The custom error class (`@rgss/errors`) carrying `code`, `statusCode`, `isOperational`, `retryable`, and `details`.
- **Request_Id**: A correlation identifier (`req_{nanoid}`) attached per request and echoed in every error response.
- **Paise**: The integer money unit used throughout the system (₹1 = 100 paise).
- **GST**: Goods and Services Tax, 18% inclusive; base value is back-calculated as `price / 1.18`.
- **Gem**: A loyalty point earned at a rate of 1 gem per ₹100 on completed service invoices.
- **Authenticated_Customer**: A signed-in user with a valid session resolved via Better Auth.
- **Admin_User**: A user whose role is at least Receptionist in the RBAC hierarchy.
- **Booking_Lifecycle**: The status state machine: `pending → confirmed/rejected → in_progress → completed`, with `cancelled`, `no_show`, and `rescheduled` transitions.

## Requirements

### Requirement 1: Standard Response Envelope and Error Handling

**User Story:** As a frontend developer, I want every API endpoint to return a consistent response shape, so that I can handle success and error cases uniformly across the application.

#### Acceptance Criteria

1. WHEN a route handler returns successfully, THE Response_Helper SHALL produce a response body of the form `{ success: true, data: <result> }`.
2. WHERE pagination applies, THE Response_Helper SHALL include a `meta` object containing `page`, `totalPages`, and `totalCount`.
3. WHEN a route handler throws an AppError, THE Error_Handler SHALL produce a response body of the form `{ success: false, error: { code, message, statusCode, requestId, retryable } }` with the AppError status code as the HTTP status.
4. IF an AppError carries a `details` value, THEN THE Error_Handler SHALL include the `details` field in the error object.
5. WHEN a route handler throws an error that is not an AppError, THE Error_Handler SHALL produce an error response with code `INTERNAL_ERROR`, statusCode 500, and `retryable` set to true.
6. THE Error_Handler SHALL include the Request_Id from the request headers in every error response.
7. WHEN a route handler throws an error that is not an AppError, THE Error_Handler SHALL report the error to the error monitoring service.

### Requirement 2: Service Catalogue Retrieval

**User Story:** As a customer, I want to view all available service categories and services, so that I can choose what to book.

#### Acceptance Criteria

1. WHEN a client requests the service catalogue, THE Services_API SHALL return all active service categories, each containing its active services.
2. THE Services_API SHALL order categories by ascending category display order and services within each category by ascending service display order.
3. THE Services_API SHALL exclude categories where the active flag is false and services where the active flag is false.
4. WHEN a client requests a single service by slug AND a matching active service exists, THE Services_API SHALL return that service with its category name, price in paise, duration in minutes, and gem-redemption fields.
5. IF a client requests a single service by slug AND no matching active service exists, THEN THE Services_API SHALL return a NOT_FOUND error with statusCode 404.

### Requirement 3: Availability Calculation

**User Story:** As a customer, I want to see available time slots for a chosen date, so that I can pick a time for my appointment.

#### Acceptance Criteria

1. WHEN a client requests availability for a date and branch, THE Availability_Service SHALL return a list of time slots, each with a start time, an end time, and an availability flag.
2. THE Availability_Service SHALL mark a slot as unavailable WHERE the slot falls outside the branch business hours for that day.
3. THE Availability_Service SHALL mark a slot as unavailable WHERE the date is a recorded holiday.
4. IF the requested date is earlier than the current date, THEN THE Availability_Service SHALL return a VALIDATION_ERROR with statusCode 400.
5. WHILE the requested date equals the current date, THE Availability_Service SHALL mark slots earlier than the current time as unavailable.
6. THE Availability_Service SHALL generate slots at fixed 30-minute intervals within the branch business hours.

### Requirement 4: Booking Number Generation

**User Story:** As a system operator, I want each booking to receive a unique, structured booking number, so that bookings can be identified and traced consistently.

#### Acceptance Criteria

1. WHEN a booking number is generated for a salon booking, THE Booking_Number_Generator SHALL produce a string matching the pattern `BK-{branchCode}-{YYMM}-H-{5random}`.
2. WHEN a booking number is generated for a spa booking, THE Booking_Number_Generator SHALL produce a string matching the pattern `BK-{branchCode}-{YYMM}-S-{5random}`.
3. THE Booking_Number_Generator SHALL derive the `YYMM` segment from the booking creation date as a two-digit year followed by a two-digit month.
4. THE Booking_Number_Generator SHALL produce a `5random` segment of exactly five alphanumeric characters.
5. WHERE a booking is a membership session, THE Booking_Number_Generator SHALL append the suffix `-M` to the booking number.

### Requirement 5: Booking Creation

**User Story:** As an authenticated customer, I want to create a booking by selecting services and a time slot, so that I can reserve an appointment.

#### Acceptance Criteria

1. IF an unauthenticated client requests booking creation, THEN THE Booking_Service SHALL return an UNAUTHENTICATED error with statusCode 401.
2. WHEN an Authenticated_Customer submits a booking with a valid branch, date, start time, and at least one service, THE Booking_Service SHALL create a booking with status `pending` and return the booking identifier and booking number.
3. IF a booking submission contains zero services, THEN THE Booking_Service SHALL return a VALIDATION_ERROR with statusCode 400.
4. IF a booking submission mixes salon and spa services, THEN THE Booking_Service SHALL return a VALIDATION_ERROR with statusCode 400.
5. WHEN a booking is created, THE Booking_Service SHALL set the booking total amount in paise to the sum of the selected service prices in paise.
6. WHEN a booking is created, THE Booking_Service SHALL set the booking total duration to the sum of the selected service durations in minutes.
7. WHEN a booking is created, THE Booking_Service SHALL store a price snapshot and a service name snapshot for each selected service.
8. IF the requested time slot is unavailable, THEN THE Booking_Service SHALL return a BOOKING_SLOT_UNAVAILABLE error with statusCode 409.
9. WHERE a booking is created as a walk-in, THE Booking_Service SHALL set the booking status to `confirmed` rather than `pending`.

### Requirement 6: Customer Booking Retrieval

**User Story:** As an authenticated customer, I want to view my bookings and their details, so that I can track my appointments.

#### Acceptance Criteria

1. IF an unauthenticated client requests bookings, THEN THE Booking_Service SHALL return an UNAUTHENTICATED error with statusCode 401.
2. WHEN an Authenticated_Customer requests their bookings, THE Booking_Service SHALL return only bookings owned by that customer.
3. WHERE a status filter is supplied, THE Booking_Service SHALL return only bookings matching that status.
4. WHEN an Authenticated_Customer requests a single booking by identifier AND the booking belongs to that customer, THE Booking_Service SHALL return the booking with its services, status, and timestamps.
5. IF an Authenticated_Customer requests a booking by identifier that does not belong to that customer, THEN THE Booking_Service SHALL return a NOT_FOUND error with statusCode 404.

### Requirement 7: Booking Cancellation

**User Story:** As an authenticated customer, I want to cancel an upcoming booking, so that I can free the slot when my plans change.

#### Acceptance Criteria

1. WHEN an Authenticated_Customer cancels a booking in status `pending` or `confirmed` that they own, THE Booking_Service SHALL set the booking status to `cancelled` and record the cancellation timestamp.
2. IF an Authenticated_Customer cancels a booking already in status `cancelled`, THEN THE Booking_Service SHALL return a BOOKING_ALREADY_CANCELLED error with statusCode 409.
3. IF an Authenticated_Customer cancels a booking in status `completed`, `in_progress`, or `no_show`, THEN THE Booking_Service SHALL return a BOOKING_INVALID_STATUS_TRANSITION error with statusCode 409.
4. WHERE a cancellation reason is supplied, THE Booking_Service SHALL store the reason on the booking.
5. WHEN a booking is cancelled, THE Booking_Service SHALL record a status log entry capturing the prior status and the new status.

### Requirement 8: Booking Reschedule

**User Story:** As an authenticated customer, I want to reschedule a confirmed booking to a new date and time, so that I can adjust my appointment without re-booking.

#### Acceptance Criteria

1. WHEN an Authenticated_Customer reschedules a booking they own with a new date and start time, THE Booking_Service SHALL update the booking date and times and increment the reschedule count.
2. IF a booking has already been rescheduled two times, THEN THE Booking_Service SHALL return a BOOKING_MAX_RESCHEDULES error with statusCode 409.
3. IF the new requested slot is unavailable, THEN THE Booking_Service SHALL return a BOOKING_SLOT_UNAVAILABLE error with statusCode 409.
4. WHEN a booking is rescheduled, THE Booking_Service SHALL record a status log entry capturing the reschedule.

### Requirement 9: Lead Capture

**User Story:** As a marketing operator, I want to capture leads from the campaign landing form, so that prospective customers enter the sales pipeline.

#### Acceptance Criteria

1. WHEN a client submits a lead with a name, a phone number, and a service of interest, THE Lead_Service SHALL create a lead record with status `new` and return the lead identifier.
2. THE Lead_Service SHALL accept lead submissions without requiring authentication.
3. IF a lead submission contains a phone number that does not match the Indian mobile number format, THEN THE Lead_Service SHALL return a VALIDATION_ERROR with statusCode 400.
4. WHERE UTM attribution fields are supplied, THE Lead_Service SHALL store the UTM source, medium, and campaign on the lead record.

### Requirement 10: Admin Booking Listing

**User Story:** As an admin user, I want to list and filter all bookings, so that I can manage daily operations.

#### Acceptance Criteria

1. IF a client whose role is below Receptionist requests the admin booking list, THEN THE Admin_Booking_Service SHALL return a FORBIDDEN error with statusCode 403.
2. WHEN an Admin_User requests the booking list, THE Admin_Booking_Service SHALL return bookings across all customers with customer name, services, assigned staff, and status.
3. WHERE a status filter is supplied, THE Admin_Booking_Service SHALL return only bookings matching that status.
4. WHERE a date filter is supplied, THE Admin_Booking_Service SHALL return only bookings on that date.
5. WHERE a service-type filter is supplied, THE Admin_Booking_Service SHALL return only bookings of that service type.

### Requirement 11: Admin Booking Approval and Assignment

**User Story:** As an admin user, I want to approve, reject, or assign staff to a booking, so that I can confirm appointments and allocate resources.

#### Acceptance Criteria

1. WHEN an Admin_User approves a booking in status `pending` with staff assignments, THE Admin_Booking_Service SHALL set the booking status to `confirmed` and persist the staff assignments.
2. WHEN an Admin_User rejects a booking in status `pending` with a rejection reason, THE Admin_Booking_Service SHALL set the booking status to `rejected` and store the rejection reason.
3. IF an Admin_User approves or rejects a booking that is not in status `pending`, THEN THE Admin_Booking_Service SHALL return a BOOKING_INVALID_STATUS_TRANSITION error with statusCode 409.
4. WHEN a booking status is changed by an Admin_User, THE Admin_Booking_Service SHALL record a status log entry capturing the prior status, the new status, and the acting user.

### Requirement 12: Admin Booking Completion with Invoice and Gems

**User Story:** As an admin user, I want to complete a booking and generate its invoice, so that payment is recorded and loyalty rewards are issued.

#### Acceptance Criteria

1. WHEN an Admin_User completes a booking in status `in_progress` or `confirmed` with a payment method, THE Admin_Booking_Service SHALL set the booking status to `completed` and create a service invoice.
2. WHEN a service invoice is created, THE Admin_Booking_Service SHALL set the taxable value in paise to the total amount divided by 1.18, rounded to the nearest integer, and the GST amount in paise to the total amount minus the taxable value.
3. WHEN a service invoice is created, THE Admin_Booking_Service SHALL award gems equal to the floor of the invoice total in rupees divided by 100.
4. WHERE the completed booking is a membership session, THE Admin_Booking_Service SHALL award zero gems.
5. IF an Admin_User completes a booking already in status `completed`, THEN THE Admin_Booking_Service SHALL return a BOOKING_INVALID_STATUS_TRANSITION error with statusCode 409.

### Requirement 13: Services Page UI Wiring

**User Story:** As a customer, I want the services page to show live data from the database, so that I see accurate, current offerings.

#### Acceptance Criteria

1. WHEN the services page loads, THE Services_API SHALL be the source of the categories and services rendered.
2. WHILE the service catalogue request is in progress, THE services page SHALL present a loading state.
3. IF the service catalogue request fails, THEN THE services page SHALL present an error state with a retry affordance.

### Requirement 14: Booking Dialog UI Wiring

**User Story:** As a customer, I want the booking dialog to load live services and availability and submit real bookings, so that I can complete a booking end to end.

#### Acceptance Criteria

1. WHEN the booking dialog opens, THE booking dialog SHALL load service categories and services from the Services_API.
2. WHEN a customer selects a date in the booking dialog, THE booking dialog SHALL load available slots from the Availability_Service for that date.
3. WHEN a customer submits the booking dialog, THE booking dialog SHALL send the selection to the Booking_Service and present the returned booking number on success.
4. IF the booking submission returns an error, THEN THE booking dialog SHALL present the error message to the customer.

### Requirement 15: Admin Bookings Page UI Wiring

**User Story:** As an admin user, I want the admin bookings page to show live bookings with working filters, so that I can manage real operational data.

#### Acceptance Criteria

1. WHEN the admin bookings page loads, THE Admin_Booking_Service SHALL be the source of the bookings rendered.
2. WHEN an Admin_User changes a filter on the admin bookings page, THE admin bookings page SHALL request the filtered set from the Admin_Booking_Service.
3. WHILE the booking list request is in progress, THE admin bookings page SHALL present a loading state.
