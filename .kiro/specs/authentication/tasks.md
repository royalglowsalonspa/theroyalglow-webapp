# Implementation Plan: Authentication

## Overview

Implement the authentication system for Royal Glow Salon & Spa using Better Auth with Google OAuth, RBAC (6 roles), session-based auth stored in Neon PostgreSQL, middleware for session validation and role enforcement, sign-in page, onboarding flow, and session context preservation across OAuth redirects.

## Tasks

> **Status note:** this spec is COMPLETE — no open tasks remain. Task 5 is implemented and
> ticked: a first-time authenticated user with no `customer_profile` is routed to
> `/onboarding`, and a user who already has one is bounced off `/onboarding` to `/`. The gate is
> a server-side check (`apps/web/src/lib/onboarding-guard.ts`) mounted in the per-segment
> layouts of `/profile`, `/bookings`, `/membership` and `/gems` plus the `/onboarding` page —
> deliberately NOT in the edge middleware, which cannot query the DB. Task 6 (`/sign-in` page)
> is SUPERSEDED by direct Google OAuth and must not be built. Task 5's `/admin/*` RBAC clause is
> SUPERSEDED by the Admin_App gate. Task 10 was a routine typecheck gate and is now verified —
> `bun run typecheck` passes 11/11 across the workspace.

- [x] 1. Install Better Auth and dependencies
  - Install `better-auth` in `apps/web` dependencies
  - Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` to `apps/web/src/env.ts` Zod validation
  - Add new env var placeholders to `.env.example`
  - Files: `apps/web/package.json`, `apps/web/src/env.ts`, `.env.example`

- [x] 2. Create Better Auth server config (`apps/web/src/lib/auth-server.ts`)
  - Import `betterAuth` from `better-auth` and `drizzleAdapter` from `better-auth/adapters/drizzle`
  - Configure with existing `db` from `@rgss/db` and schema tables (user, session, account, verification)
  - Set up Google OAuth provider with scopes: email, profile, phonenumbers.read
  - Enable RBAC plugin with 6 roles (customer as default)
  - Enable session cookie caching (5 min maxAge)
  - Set baseURL and trustedOrigins from env
  - Export `auth` instance and `Session` type
  - Files: `apps/web/src/lib/auth-server.ts`

- [x] 3. Create Better Auth client config (`apps/web/src/lib/auth-client.ts`)
  - Import `createAuthClient` from `better-auth/react`
  - Configure with baseURL from `NEXT_PUBLIC_APP_URL`
  - Export destructured: `useSession`, `signIn`, `signOut`, and full `authClient`
  - Files: `apps/web/src/lib/auth-client.ts`

- [x] 4. Create auth API route (`apps/web/src/app/api/auth/[...all]/route.ts`)
  - Import `auth` from `@/lib/auth-server`
  - Import `toNextJsHandler` from `better-auth/next-js`
  - Export GET and POST handlers
  - Files: `apps/web/src/app/api/auth/[...all]/route.ts`

- [x] 5. Route a first-time user with no `customer_profile` to `/onboarding`
  - **Already shipped — do not redo.** The edge session gate exists in
    `apps/web/src/middleware.ts`: `SESSION_COOKIE = 'better-auth.session_token'` checked
    against `PROTECTED_PREFIXES = ['/onboarding', '/profile', '/bookings', '/membership',
    '/gems']`, scoped via `config.matcher`. It redirects unauthenticated users to `/` rather
    than `/sign-in` — correct, because task 6 is superseded and no `/sign-in` page exists.
  - ~~`/admin/*` requires minimum role receptionist (level 2) → 403 if below~~
    **SUPERSEDED — do NOT add RBAC to the web middleware.** `apps/web/src/middleware.ts` now
    301-redirects `/admin/*` to the admin subdomain via `mapAdminRedirect`
    (`apps/web/src/lib/admin-redirect.ts`). Role enforcement moved to the standalone Admin_App:
    `apps/admin/src/middleware.ts` + `apps/admin/src/lib/rbac.ts`, covered across all 6 roles
    by `apps/admin/src/lib/middleware-access-matrix.test.ts`. Reintroducing a receptionist RBAC
    clause here would duplicate and contradict that gate.
  - **DONE (the real gap, now closed):** the profile-completion routing lives in
    `apps/web/src/lib/onboarding-guard.ts`, which exposes two mutually exclusive server-side
    gates over one fact (`hasCustomerProfile(userId)`):
    - `requireOnboardedSession()` — no session → `/`; session without a profile → `/onboarding`;
      otherwise returns the session. Mounted in the per-segment server layouts
      `app/(customer)/{profile,bookings,membership,gems}/layout.tsx`, which covers the nested
      `/bookings/[id]` route too.
    - `requireOnboardingPending()` — no session → `/`; session WITH a profile → `/`; session
      without one → allowed through. Used by `app/(auth)/onboarding/page.tsx`, so the form
      cannot be re-submitted and the API's 409 `PROFILE_EXISTS` is unreachable via the UI.
    - No redirect loop: profile MISSING → `/onboarding` allowed and protected pages redirect to
      it; profile PRESENT → protected pages allowed and `/onboarding` redirects to `/`.
    - Public-page cost: the gate is NOT in `(customer)/layout.tsx` (shared with the homepage,
      `/services`, `/blog`, `/about`, `/contact`, `/faq`) nor in the `(landing)`/`(legal)`/root
      layouts, so genuinely public pages keep a zero-DB-round-trip render.
    - Data access: `hasCustomerProfile(userId)` added to `packages/db/src/queries/customers.ts`
      (single `SELECT 1 … LIMIT 1`, no joins) and re-exported by the `@rgss/db/queries` barrel.
  - **Implementation constraint — honoured.** `apps/web/src/middleware.ts` is UNCHANGED: Better
    Auth's `auth-server` cannot be imported at the edge (kysely is incompatible with the edge
    runtime), so no `customer_profile` lookup was added there. The check runs in server
    components instead. `apps/web/src/lib/onboarding-guard.test.ts` asserts this statically.
  - Files: `apps/web/src/lib/onboarding-guard.ts`,
    `apps/web/src/app/(customer)/{profile,bookings,membership,gems}/layout.tsx`,
    `apps/web/src/app/(auth)/onboarding/page.tsx`, `packages/db/src/queries/customers.ts`,
    `apps/web/src/lib/onboarding-guard.test.ts` — explicitly NOT `apps/web/src/middleware.ts`

- ~~6. Create sign-in page (`apps/web/src/app/(auth)/sign-in/page.tsx`)~~ — **SUPERSEDED. NOT DONE, NOT PENDING. DO NOT BUILD.**
  - There is deliberately no `/sign-in` page anywhere in `apps/web` — `app/(auth)/` contains
    only `layout.tsx` and `onboarding/`. Replaced by launching Google OAuth directly from
    `apps/web/src/lib/google-signin.ts`, whose header states it “launches the Google OAuth flow
    directly (no intermediate /sign-in page)”. Commit `1c2b403`.
  - `startGoogleSignIn()` is the single source of truth for “Sign in with Google” and is called
    from the navbar (`components/layout/Header.tsx`), the mobile nav
    (`components/layout/MobileNav.tsx`), and the booking dialog
    (`components/booking/BookingDialog.tsx`). Google One Tap lives in
    `components/auth/GoogleOneTap.tsx`. `apps/web/src/middleware.ts` confirms the
    unauthenticated redirect target is `/`, not `/sign-in`.
  - The sessionStorage context preservation this task called for still happens — in
    `google-signin.ts` under the `rgss_auth_context` key, read by the onboarding flow.
  - **Why not to rebuild it:** a `/sign-in` page would reinstate the intermediate step this
    design removed, orphan `startGoogleSignIn()`, and contradict the `/` redirect contract in
    middleware plus the `/sign-in`-free assumption recorded in task 5.

- [x] 7. Create onboarding page (`apps/web/src/app/(auth)/onboarding/page.tsx`)
  - Server component: fetch session for user name/email prefill
  - Client component (OnboardingForm): form with validation
  - Fields: name (prefilled, editable), email (disabled), phone (tel), dateOfBirth (date picker), gender (select)
  - Consent: privacy (required), analytics (optional), marketing (optional)
  - Validation: phone /^[6-9]\d{9}$/, privacy required, DOB required
  - On submit: POST to /api/onboarding/complete with form data + sessionStorage context
  - On success: write rgss_cookie_consent to localStorage, clear sessionStorage, redirect to /
  - Files: `apps/web/src/app/(auth)/onboarding/page.tsx`

- [x] 8. Create onboarding API route (`apps/web/src/app/api/onboarding/complete/route.ts`)
  - Require authenticated session (401 if not)
  - Validate body with Zod (name, phone, dateOfBirth, gender, consents, UTM fields)
  - Check if customer_profile exists → 409 if yes
  - Resolve acquisition source: leadId→meta_ad, utmSource→direct map, nothing→organic
  - Insert customer_profile record with all fields
  - Update user.name if changed
  - Return 201 with profileId
  - Files: `apps/web/src/app/api/onboarding/complete/route.ts`

- [x] 9. Create auth layout (`apps/web/src/app/(auth)/layout.tsx`)
  - Full viewport height (min-h-screen), flexbox centering
  - Branded gradient background (warm amber/rose tones)
  - Content wrapper with max-w-md and horizontal padding
  - No site header or footer navigation
  - Files: `apps/web/src/app/(auth)/layout.tsx`

- [x] 10. Verification — typecheck passes
  - Run `tsc --noEmit` in apps/web
  - Verify all imports resolve (auth-server, auth-client, db schema)
  - Ensure no `any` types or `@ts-ignore` in new files
  - Run `turbo typecheck` for full workspace
  - Files: N/A (verification only)

## Task Dependency Graph

```json
{
  "waves": [
    ["1. Install Better Auth and dependencies"],
    ["2. Create Better Auth server config", "3. Create Better Auth client config", "9. Create auth layout"],
    ["4. Create auth API route", "5. Route first-time user with no customer_profile to /onboarding", "8. Create onboarding API route"],
    ["7. Create onboarding page"],
    ["10. Verification — typecheck passes"]
  ]
}
```

## Notes

- Better Auth manages the `user`, `session`, `account`, and `verification` tables — these already exist in `packages/db/src/schema/auth.ts`
- The `customer_profile` table already exists in `packages/db/src/schema/profile.ts`
- Google OAuth callback URL in production: `https://theroyalglow.in/api/auth/callback/google`
- The RBAC plugin uses the `role` column on the `user` table (already defined)
- No email/password auth — Google OAuth is the sole provider
- Session context uses `sessionStorage` (not `localStorage`) because it survives same-tab navigations including OAuth redirects
- **Task 6 is SUPERSEDED** — there is no `/sign-in` page. `startGoogleSignIn()` in   `apps/web/src/lib/google-signin.ts` launches Google OAuth directly from the navbar, mobile nav,   and booking dialog, with One Tap in `components/auth/GoogleOneTap.tsx` (commit `1c2b403`). No   wave depends on a sign-in page; do not reintroduce one. - **Task 5's `/admin/*` RBAC clause is SUPERSEDED** — `apps/web/src/middleware.ts` 301-redirects   `/admin/*` to the admin subdomain (`mapAdminRedirect`); role enforcement lives in   `apps/admin/src/middleware.ts` + `apps/admin/src/lib/rbac.ts` and is covered for all 6 roles by   `apps/admin/src/lib/middleware-access-matrix.test.ts`.
