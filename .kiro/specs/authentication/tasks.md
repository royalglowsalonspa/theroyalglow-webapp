# Implementation Plan: Authentication

## Overview

Implement the authentication system for Royal Glow Salon & Spa using Better Auth with Google OAuth, RBAC (6 roles), session-based auth stored in Neon PostgreSQL, middleware for session validation and role enforcement, sign-in page, onboarding flow, and session context preservation across OAuth redirects.

## Tasks

- [ ] 1. Install Better Auth and dependencies
  - Install `better-auth` in `apps/web` dependencies
  - Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` to `apps/web/src/env.ts` Zod validation
  - Add new env var placeholders to `.env.example`
  - Files: `apps/web/package.json`, `apps/web/src/env.ts`, `.env.example`

- [ ] 2. Create Better Auth server config (`apps/web/src/lib/auth-server.ts`)
  - Import `betterAuth` from `better-auth` and `drizzleAdapter` from `better-auth/adapters/drizzle`
  - Configure with existing `db` from `@rgss/db` and schema tables (user, session, account, verification)
  - Set up Google OAuth provider with scopes: email, profile, phonenumbers.read
  - Enable RBAC plugin with 6 roles (customer as default)
  - Enable session cookie caching (5 min maxAge)
  - Set baseURL and trustedOrigins from env
  - Export `auth` instance and `Session` type
  - Files: `apps/web/src/lib/auth-server.ts`

- [ ] 3. Create Better Auth client config (`apps/web/src/lib/auth-client.ts`)
  - Import `createAuthClient` from `better-auth/react`
  - Configure with baseURL from `NEXT_PUBLIC_APP_URL`
  - Export destructured: `useSession`, `signIn`, `signOut`, and full `authClient`
  - Files: `apps/web/src/lib/auth-client.ts`

- [ ] 4. Create auth API route (`apps/web/src/app/api/auth/[...all]/route.ts`)
  - Import `auth` from `@/lib/auth-server`
  - Import `toNextJsHandler` from `better-auth/next-js`
  - Export GET and POST handlers
  - Files: `apps/web/src/app/api/auth/[...all]/route.ts`

- [ ] 5. Create middleware (`apps/web/src/middleware.ts`)
  - Define role hierarchy as numeric levels (customer=0 through developer=5)
  - Use config.matcher to scope to protected paths only
  - Validate session via `auth.api.getSession({ headers })`
  - Unauthenticated → redirect to `/sign-in`
  - No customer_profile (not on /onboarding) → redirect to `/onboarding`
  - Has profile on /onboarding → redirect to `/`
  - `/admin/*` requires minimum role receptionist (level 2) → 403 if below
  - Files: `apps/web/src/middleware.ts`

- [ ] 6. Create sign-in page (`apps/web/src/app/(auth)/sign-in/page.tsx`)
  - Server component for metadata (robots: noindex, nofollow)
  - Client component (SignInCard) for interactive OAuth button
  - On mount: read URL params and existing sessionStorage context
  - On click: save context to sessionStorage → call signIn.social({ provider: 'google' })
  - States: idle, redirecting (spinner + disabled), error (message + retry)
  - UI: Royal Glow logo, heading, subheading, Google-branded button, legal links
  - Responsive: max-w-md card on desktop, full-width on mobile
  - Files: `apps/web/src/app/(auth)/sign-in/page.tsx`

- [ ] 7. Create onboarding page (`apps/web/src/app/(auth)/onboarding/page.tsx`)
  - Server component: fetch session for user name/email prefill
  - Client component (OnboardingForm): form with validation
  - Fields: name (prefilled, editable), email (disabled), phone (tel), dateOfBirth (date picker), gender (select)
  - Consent: privacy (required), analytics (optional), marketing (optional)
  - Validation: phone /^[6-9]\d{9}$/, privacy required, DOB required
  - On submit: POST to /api/onboarding/complete with form data + sessionStorage context
  - On success: write rgss_cookie_consent to localStorage, clear sessionStorage, redirect to /
  - Files: `apps/web/src/app/(auth)/onboarding/page.tsx`

- [ ] 8. Create onboarding API route (`apps/web/src/app/api/onboarding/complete/route.ts`)
  - Require authenticated session (401 if not)
  - Validate body with Zod (name, phone, dateOfBirth, gender, consents, UTM fields)
  - Check if customer_profile exists → 409 if yes
  - Resolve acquisition source: leadId→meta_ad, utmSource→direct map, nothing→organic
  - Insert customer_profile record with all fields
  - Update user.name if changed
  - Return 201 with profileId
  - Files: `apps/web/src/app/api/onboarding/complete/route.ts`

- [ ] 9. Create auth layout (`apps/web/src/app/(auth)/layout.tsx`)
  - Full viewport height (min-h-screen), flexbox centering
  - Branded gradient background (warm amber/rose tones)
  - Content wrapper with max-w-md and horizontal padding
  - No site header or footer navigation
  - Files: `apps/web/src/app/(auth)/layout.tsx`

- [ ] 10. Verification — typecheck passes
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
    ["4. Create auth API route", "5. Create middleware", "8. Create onboarding API route"],
    ["6. Create sign-in page", "7. Create onboarding page"],
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
