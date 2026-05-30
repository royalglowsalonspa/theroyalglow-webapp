# Requirements Document

## Introduction

This specification covers the authentication and authorization system for the Royal Glow Salon & Spa web application. The system uses Better Auth with Google OAuth as the sole authentication provider, implements role-based access control (RBAC) with six roles, handles first-time user onboarding, and preserves session context (UTM/booking parameters) across the OAuth redirect flow.

## Glossary

- **Auth_Server**: The Better Auth server-side configuration module (`apps/web/src/lib/auth-server.ts`) that handles OAuth flows, session management, and RBAC enforcement
- **Auth_Client**: The Better Auth client-side configuration module (`apps/web/src/lib/auth-client.ts`) that provides `useSession` hook and sign-in/sign-out methods
- **Auth_API_Route**: The Next.js catch-all API route (`/api/auth/[...all]/route.ts`) that delegates all auth HTTP requests to the Auth_Server
- **Middleware**: The Next.js middleware (`apps/web/src/middleware.ts`) that intercepts requests to validate sessions and enforce RBAC on protected routes
- **Sign_In_Page**: The `/sign-in` page presenting the Google OAuth button
- **Onboarding_Page**: The `/onboarding` page collecting first-time user profile data
- **Onboarding_API**: The `POST /api/onboarding/complete` route that persists onboarding data
- **Session_Context**: The `sessionStorage` object (`rgss_auth_context`) preserving UTM parameters, booking intent, and lead references across the OAuth redirect
- **Customer_Profile**: The `customer_profile` database table storing user profile, consent, and acquisition data
- **Role_Hierarchy**: The ordered set Developer > Owner > Manager > Receptionist > Staff > Customer

## Requirements

### Requirement 1: Better Auth Server Configuration

**User Story:** As a developer, I want Better Auth configured with the Drizzle adapter and Google OAuth provider, so that authentication runs on our own domain with sessions stored in Neon PostgreSQL.

#### Acceptance Criteria

1. THE Auth_Server SHALL use the Drizzle ORM adapter connected to the existing Neon PostgreSQL database
2. THE Auth_Server SHALL configure Google OAuth as the sole authentication provider with client ID and secret from environment variables
3. THE Auth_Server SHALL set the OAuth callback URL to `https://theroyalglow.in/api/auth/callback/google`
4. THE Auth_Server SHALL enable the RBAC plugin with six roles: customer, staff, receptionist, manager, owner, developer
5. THE Auth_Server SHALL assign the `customer` role as the default role for newly created users
6. THE Auth_Server SHALL request the OAuth scopes: `email`, `profile`, and `https://www.googleapis.com/auth/user.phonenumbers.read`

### Requirement 2: Better Auth Client Configuration

**User Story:** As a developer, I want a client-side auth module that provides session hooks and sign-in methods, so that React components can access authentication state and trigger OAuth flows.

#### Acceptance Criteria

1. THE Auth_Client SHALL export a `createAuthClient` instance configured with the base URL pointing to the application origin
2. THE Auth_Client SHALL export a `useSession` hook that returns the current user session including user ID, name, email, image, and role
3. THE Auth_Client SHALL export a `signIn` method that initiates the Google OAuth redirect flow
4. THE Auth_Client SHALL export a `signOut` method that terminates the current session and redirects to the homepage

### Requirement 3: Auth API Route

**User Story:** As a developer, I want a catch-all API route that delegates all authentication HTTP requests to Better Auth, so that OAuth callbacks, session management, and token operations are handled automatically.

#### Acceptance Criteria

1. THE Auth_API_Route SHALL handle all HTTP methods (GET, POST) for paths matching `/api/auth/*`
2. THE Auth_API_Route SHALL delegate request handling to the Auth_Server instance
3. THE Auth_API_Route SHALL return appropriate HTTP status codes for success and failure responses

### Requirement 4: Middleware Session Validation and RBAC

**User Story:** As a developer, I want middleware that validates sessions and enforces role-based access on protected routes, so that unauthenticated users are redirected and unauthorized users are blocked before page rendering.

#### Acceptance Criteria

1. WHEN an unauthenticated user requests a route matching `/admin/*`, THE Middleware SHALL redirect the user to `/sign-in`
2. WHEN an unauthenticated user requests a route matching `/onboarding`, `/profile`, or `/bookings`, THE Middleware SHALL redirect the user to `/sign-in`
3. WHEN an authenticated user with a role below `receptionist` in the Role_Hierarchy requests a route matching `/admin/*`, THE Middleware SHALL return a 403 Forbidden response
4. WHEN an authenticated user without a completed Customer_Profile requests any protected route other than `/onboarding` or `/api/onboarding/complete`, THE Middleware SHALL redirect the user to `/onboarding`
5. WHEN an authenticated user with a completed Customer_Profile requests `/onboarding`, THE Middleware SHALL redirect the user to the homepage
6. THE Middleware SHALL attach the validated session (user ID, role) to the request context for downstream route handlers
7. THE Middleware SHALL NOT intercept requests to public routes (`/`, `/services`, `/about`, `/contact`, `/faq`, `/sign-in`, `/api/auth/*`)

### Requirement 5: Sign-In Page

**User Story:** As a customer, I want a sign-in page with a Google OAuth button, so that I can authenticate using my Google account with minimal friction.

#### Acceptance Criteria

1. THE Sign_In_Page SHALL display the Royal Glow logo, a heading "Sign in to Royal Glow", and a subheading "Use your Google account to continue"
2. THE Sign_In_Page SHALL display a full-width "Sign in with Google" button styled with Google branding guidelines
3. THE Sign_In_Page SHALL display legal text linking to the Privacy Policy and Terms of Service pages
4. WHEN the user clicks the sign-in button, THE Sign_In_Page SHALL save the current Session_Context to `sessionStorage` before initiating the OAuth redirect
5. WHILE the OAuth redirect is in progress, THE Sign_In_Page SHALL disable the button and display a "Redirecting to Google..." state with a spinner
6. IF the OAuth flow fails or is blocked, THEN THE Sign_In_Page SHALL display an error message "Sign-in failed. Please try again." with a retry button
7. THE Sign_In_Page SHALL render as a centered card (max-width 400px on desktop, full-width on mobile) on a branded gradient background
8. THE Sign_In_Page SHALL set `robots: noindex, nofollow` in its metadata

### Requirement 6: Onboarding Page

**User Story:** As a first-time customer, I want an onboarding page that collects my profile information and consent preferences, so that my account is fully set up for booking services.

#### Acceptance Criteria

1. THE Onboarding_Page SHALL display a welcome heading including the user's first name from their Google profile
2. THE Onboarding_Page SHALL display form fields for: name (prefilled, editable), email (prefilled, read-only), phone (tel input), date of birth (DD/MM/YYYY date picker), and gender (select: Male, Female, Other, Prefer not to say)
3. THE Onboarding_Page SHALL display a consent section with three checkboxes: privacy policy agreement (required), anonymous analytics consent (optional), and marketing communications consent (optional)
4. WHEN the user submits the form with valid data, THE Onboarding_Page SHALL POST to `/api/onboarding/complete` with the form data and Session_Context values
5. IF the phone number does not match a valid Indian mobile format (10 digits starting with 6-9), THEN THE Onboarding_Page SHALL display an inline validation error
6. IF the privacy policy checkbox is not checked, THEN THE Onboarding_Page SHALL prevent form submission and display a validation error
7. WHILE the form is submitting, THE Onboarding_Page SHALL disable all fields and display a spinner on the submit button
8. WHEN the Onboarding_API returns success, THE Onboarding_Page SHALL write consent choices to `rgss_cookie_consent` in localStorage, clear the Session_Context from sessionStorage, and redirect to the homepage
9. THE Onboarding_Page SHALL set `robots: noindex, nofollow` in its metadata

### Requirement 7: Onboarding API Route

**User Story:** As a developer, I want an API route that persists onboarding data to the customer_profile table, so that first-time user information and acquisition source are stored correctly.

#### Acceptance Criteria

1. WHEN a valid POST request is received, THE Onboarding_API SHALL create a Customer_Profile record with the submitted name, phone, date of birth, gender, and consent values
2. THE Onboarding_API SHALL determine the acquisition source from the submitted Session_Context: `utm_source` value maps directly (gmb, walkin), presence of `leadId` maps to `meta_ad`, and absence of context maps to `organic`
3. THE Onboarding_API SHALL store `utm_source`, `utm_campaign`, and `utm_medium` values from the Session_Context into the corresponding Customer_Profile columns
4. IF the requesting user already has a Customer_Profile record, THEN THE Onboarding_API SHALL return a 409 Conflict response
5. IF the request body fails Zod validation, THEN THE Onboarding_API SHALL return a 400 response with field-level error details
6. THE Onboarding_API SHALL require an authenticated session and return 401 for unauthenticated requests

### Requirement 8: Session Context Preservation

**User Story:** As a customer arriving via a marketing link, I want my UTM parameters and booking intent preserved across the Google OAuth redirect, so that my acquisition source is correctly attributed and the booking dialog reopens after sign-in.

#### Acceptance Criteria

1. WHEN the user initiates sign-in, THE Sign_In_Page SHALL save to sessionStorage under key `rgss_auth_context`: the `book` flag, `utm_source`, `utm_campaign`, `utm_medium`, `leadId`, and `service` slug from the current URL or existing sessionStorage
2. THE Session_Context SHALL survive the Google OAuth redirect because sessionStorage persists across same-tab navigations
3. WHEN the user completes onboarding, THE Onboarding_Page SHALL read the Session_Context to pass acquisition data to the Onboarding_API and then clear the stored context
4. WHEN a returning user (profile already complete) arrives back from OAuth, THE Middleware SHALL allow the redirect to homepage where client-side code reads Session_Context to restore booking intent (e.g., auto-open booking dialog if `book=1`)

### Requirement 9: Auth Layout

**User Story:** As a developer, I want a shared layout for auth pages (sign-in, onboarding), so that they share a consistent minimal design without the main site navigation.

#### Acceptance Criteria

1. THE Auth_Layout SHALL render a minimal layout without the main site header or footer navigation
2. THE Auth_Layout SHALL center its content vertically and horizontally on the viewport
3. THE Auth_Layout SHALL apply the branded gradient background consistent with the Royal Glow design system
