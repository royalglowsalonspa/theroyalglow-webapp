# Requirements Document

## Introduction

Phase 5 delivers the operational layer of the Royal Glow Salon & Spa (RGSS) platform on top of the booking (Phase 3) and CRM (Phase 4) foundations. It covers three cohesive areas: **Staff Scheduling & Leave** (weekly availability grid, leave submission and approval with conflict detection), **Notifications & Realtime** (persistent notification records, an in-app feed and bell, Web Push subscription management, and an Ably token endpoint), and **Offers** (admin offer management, a customer-facing active-offers display, and offer application at checkout).

All work follows the established layered architecture: API routes are thin orchestrators (parse → Zod validate → call business logic / query layer → return the standard envelope), business rules are pure functions in `packages/business` that throw `AppError`, and all database access is isolated in `packages/db/queries`. Every response conforms to the single envelope shape and every route is wrapped with `withErrorHandler()`. The underlying tables already exist and are pushed to Neon; the only schema change is one additive nullable column (`notification.read_at`) to support the in-app unread bell.

Out of scope for this phase (deferred to Phase 6 / later): actual Web Push and email delivery (a single `dispatchNotification` extension point is provided), QStash scheduled/triggered jobs, server-side Ably event publishing on mutations, automated same-day mark-off reassignment with customer notification, and pg_cron offer auto-expiry. Where these are side effects, the API exposes an extension point but does not implement the external integration here.

## Glossary

- **Schedule_Service**: The API and logic for defining and reading staff weekly schedules (`/api/admin/schedule`).
- **Leave_Service**: The API and logic for leave submission, withdrawal, and approval (`/api/admin/leave`, `/api/staff/leave`).
- **Leave_Lifecycle**: The leave state machine: `pending → approved | rejected | withdrawn`, with approved/rejected/withdrawn terminal.
- **Notification_Service**: The API and logic for the in-app notification feed, unread count, and mark-read (`/api/notifications`).
- **Push_Service**: The API for storing and removing Web Push subscriptions (`/api/push/subscribe`).
- **Realtime_Token_Service**: The endpoint issuing scoped Ably token requests (`/api/ably/token`).
- **Offer_Service**: The API and logic for offer management and the public active-offers list (`/api/admin/offers`, `/api/offers`).
- **Offer_Application**: The integration that applies an offer to a booking at completion, computing the discount and recording a redemption.
- **Dispatch_Extension_Point**: The single `dispatchNotification` seam between persisting a notification record and delivering it via push/email; a no-op until provider keys are configured.
- **Staff_Member**: A user whose role is at least Staff and who has an associated `staff_profile`.
- **Admin_User**: A user whose role is at least Receptionist in the RBAC hierarchy.
- **Manager_User**: A user whose role is at least Manager.
- **Authenticated_User**: A signed-in user with a valid session resolved via Better Auth.
- **Standard_Envelope**: The response contract — `{ success: true, data: T, meta? }` on success or `{ success: false, error: {...} }` on failure.
- **Paise**: The integer money unit used throughout the system (₹1 = 100 paise).
- **Conflict**: A booking in status `confirmed` assigned to a staff member on a date for which leave is being approved.

## Requirements

### Requirement 1: Staff Weekly Schedule

**User Story:** As a manager, I want to define and view each staff member's weekly working hours, so that capacity and availability are clear.

#### Acceptance Criteria

1. IF a client whose role is below Manager requests or updates a staff schedule, THEN THE Schedule_Service SHALL return a FORBIDDEN error with statusCode 403.
2. IF a schedule entry is marked as working AND its start time or end time is missing, or its start time is not earlier than its end time, THEN THE Schedule_Service SHALL return a VALIDATION_ERROR with statusCode 400.
3. WHEN a Manager_User submits a staff member's seven-day schedule, THE Schedule_Service SHALL persist one entry per day of week, replacing any existing entries for that staff member.
4. WHEN a Manager_User requests the weekly schedule grid for a week, THE Schedule_Service SHALL return each active staff member with their working hours, any approved leave on the week's dates, and their booking counts per day.

### Requirement 2: Leave Submission and Approval

**User Story:** As a staff member, I want to request leave and have it approved or rejected, so that my time off is recorded and conflicts are surfaced.

#### Acceptance Criteria

1. IF an unauthenticated client submits a leave request, THEN THE Leave_Service SHALL return an UNAUTHENTICATED error with statusCode 401.
2. WHEN a Staff_Member submits a leave request with a type and a date, THE Leave_Service SHALL create a leave record with status `pending` scoped to that staff member.
3. IF a Staff_Member submits a leave request for a date on which they already have a leave record, THEN THE Leave_Service SHALL return a CONFLICT error with statusCode 409.
4. IF an Admin_User requests a leave transition that is not permitted by the Leave_Lifecycle, THEN THE Leave_Service SHALL return a CONFLICT (or BUSINESS_RULE_VIOLATION) error with statusCode 409.
5. IF an Admin_User rejects a leave request without supplying a reason, THEN THE Leave_Service SHALL return a VALIDATION_ERROR with statusCode 400.
6. WHEN an Admin_User approves a leave request, THE Leave_Service SHALL set the status to `approved`, record the reviewer, and return any confirmed bookings assigned to that staff member on the leave date as conflicts.
7. WHEN a Staff_Member withdraws their own leave request that is still `pending`, THE Leave_Service SHALL set the status to `withdrawn`; AND IF the request is not owned by that staff member, THEN THE Leave_Service SHALL return a NOT_FOUND or FORBIDDEN error.

### Requirement 3: In-App Notifications

**User Story:** As an authenticated user, I want to see my notifications and unread count, so that I stay informed of relevant events.

#### Acceptance Criteria

1. IF an unauthenticated client requests notifications, THEN THE Notification_Service SHALL return an UNAUTHENTICATED error with statusCode 401.
2. WHEN an Authenticated_User requests their notifications, THE Notification_Service SHALL return only notifications owned by that user, newest first, and SHALL NOT expose another user's notifications.
3. WHEN an Authenticated_User requests their notifications, THE Notification_Service SHALL include an unread count equal to the number of that user's notifications that have not been marked read.
4. WHEN an Authenticated_User marks notifications read, THE Notification_Service SHALL mark the specified notifications read, or all of the user's notifications read when no identifiers are supplied.
5. WHEN a relevant event occurs (booking confirmation, rejection, reschedule, or cancellation; lead staleness; leave decision), THE Notification_Service SHALL create a notification record with a non-empty title and body for the affected user and invoke the Dispatch_Extension_Point.

### Requirement 4: Web Push and Realtime Token

**User Story:** As an authenticated user, I want to subscribe to push notifications and connect to realtime updates, so that I receive timely information.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits a push subscription with an endpoint and keys, THE Push_Service SHALL store the subscription for that user.
2. WHEN an Authenticated_User removes a push subscription by endpoint, THE Push_Service SHALL deactivate that subscription.
3. WHEN an Authenticated_User requests a realtime token AND the realtime provider is configured, THE Realtime_Token_Service SHALL return a token request scoped to that user's channels and role.
4. IF an Authenticated_User requests a realtime token AND the realtime provider is not configured, THEN THE Realtime_Token_Service SHALL return a SERVICE_UNAVAILABLE error with statusCode 503.

### Requirement 5: Offer Management and Application

**User Story:** As a manager, I want to create offers and have them applied correctly at checkout, so that promotions run within the business rules.

#### Acceptance Criteria

1. IF a client whose role is below Manager creates or updates an offer, THEN THE Offer_Service SHALL return a FORBIDDEN error with statusCode 403.
2. WHEN an offer discount is computed for a non-negative subtotal in paise, THE Offer_Service SHALL return an integer discount and final amount in paise such that the discount is between zero and the subtotal inclusive and the final amount equals the subtotal minus the discount.
3. IF an offer is applied while it is inactive or outside its start and end date range, THEN THE Offer_Application SHALL return an OFFER_EXPIRED error with statusCode 409.
4. WHEN a client requests the active offers list, THE Offer_Service SHALL return only offers that are active and whose current date falls within their start and end date range, each with its applicable service names.
5. IF an offer is applied to a booking for a customer who has already redeemed an offer on the same date, THEN THE Offer_Application SHALL return a CONFLICT (or OFFER_NOT_APPLICABLE) error with statusCode 409.
6. IF an offer is applied to a booking that contains any spa service, or to a booking that also redeems gems, THEN THE Offer_Application SHALL return an OFFER_NOT_APPLICABLE error with statusCode 409.
7. WHEN an offer is applied at booking completion, THE Offer_Application SHALL set the invoice discount to the computed discount, record an offer redemption for that customer and date, and award gems based on the discounted total.

### Requirement 6: Standard Envelope, RBAC, and Navigation Consistency

**User Story:** As a frontend developer, I want every Phase 5 endpoint to follow the established response, error, and access-control conventions, so that the UI handles them uniformly.

#### Acceptance Criteria

1. WHEN any Phase 5 route handler returns successfully, THE handler SHALL produce a response body of the form `{ success: true, data: <result> }`, including a `meta` object where pagination applies.
2. WHEN any Phase 5 route handler throws an AppError, THE Error_Handler SHALL produce the standard error envelope with the AppError status code as the HTTP status and the request identifier echoed.
3. WHEN the admin and customer headers are rendered, THE navigation SHALL include a notification bell showing the unread count for the authenticated user.
4. WHEN a staff member accesses the staff area, THE navigation SHALL provide access to their own schedule and leave, scoped to role Staff or above.
