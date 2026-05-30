# Design Document

## Overview

This design implements the authentication system for Royal Glow Salon & Spa using Better Auth with Google OAuth, RBAC with six roles, session-based auth stored in Neon PostgreSQL via Drizzle ORM, and a first-time onboarding flow that preserves marketing attribution context across the OAuth redirect.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Client)                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Sign-In Page │  │ Onboarding   │  │ Auth Client (useSession) │  │
│  │ /sign-in     │  │ /onboarding  │  │ lib/auth-client.ts       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘  │
│         │                  │                                         │
│  ┌──────▼──────────────────▼─────────────────────────────────────┐  │
│  │  sessionStorage: rgss_auth_context                             │  │
│  │  { book, utm_source, utm_campaign, utm_medium, leadId, svc }  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │                  │
         ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js Server                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Middleware (src/middleware.ts)                                  │ │
│  │  • Session validation via Better Auth                           │ │
│  │  • RBAC enforcement on /admin/* routes                          │ │
│  │  • Onboarding redirect for incomplete profiles                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────────────────────────────┐ │
│  │ Auth API Route   │  │ Onboarding API Route                     │ │
│  │ /api/auth/[...] │  │ /api/onboarding/complete                 │ │
│  └────────┬─────────┘  └────────────────┬─────────────────────────┘ │
│           │                              │                           │
│  ┌────────▼──────────────────────────────▼─────────────────────────┐│
│  │  Auth Server (lib/auth-server.ts)                                ││
│  │  • Better Auth instance                                          ││
│  │  • Drizzle adapter → Neon PostgreSQL                             ││
│  │  • Google OAuth provider                                         ││
│  │  • RBAC plugin (6 roles)                                         ││
│  └──────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Neon PostgreSQL                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────────┐ │
│  │  user    │ │ session  │ │ account  │ │  customer_profile      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              ← Auth layout (minimal, centered)
│   │   ├── sign-in/
│   │   │   └── page.tsx            ← Sign-in page
│   │   └── onboarding/
│   │       └── page.tsx            ← Onboarding page
│   └── api/
│       ├── auth/
│       │   └── [...all]/
│       │       └── route.ts        ← Better Auth catch-all handler
│       └── onboarding/
│           └── complete/
│               └── route.ts        ← Onboarding submission handler
├── lib/
│   ├── auth-server.ts              ← Better Auth server config
│   └── auth-client.ts              ← Better Auth client config
└── middleware.ts                    ← Session + RBAC middleware
```

## Components and Interfaces

### Auth Server Interface (`lib/auth-server.ts`)

```typescript
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@rgss/db'
import * as schema from '@rgss/db/schema'
import { env } from '@/env'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/user.phonenumbers.read',
      ],
    },
  },
  plugins: [
    // RBAC plugin with role hierarchy
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  baseURL: env.NEXT_PUBLIC_APP_URL,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
})

export type Session = typeof auth.$Infer.Session
```

### Auth Client Interface (`lib/auth-client.ts`)

```typescript
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
})

export const { useSession, signIn, signOut } = authClient
```

### Auth API Route Interface (`app/api/auth/[...all]/route.ts`)

```typescript
import { auth } from '@/lib/auth-server'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

### Middleware Interface (`middleware.ts`)

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ROLE_LEVELS: Record<string, number> = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

const ADMIN_MIN_ROLE = 'receptionist' // level 2

export async function middleware(request: NextRequest): Promise<NextResponse>

export const config = {
  matcher: [
    '/admin/:path*',
    '/onboarding',
    '/profile',
    '/bookings/:path*',
    '/api/onboarding/:path*',
  ],
}
```

### Onboarding API Interface (`app/api/onboarding/complete/route.ts`)

```typescript
import { z } from 'zod'

const onboardingSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  dateOfBirth: z.string().date(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  privacyConsent: z.literal(true),
  analyticsConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
  utmSource: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmMedium: z.string().optional(),
  leadId: z.string().optional(),
})

type OnboardingInput = z.infer<typeof onboardingSchema>

// POST handler: validates, resolves acquisition source, creates customer_profile
export async function POST(request: Request): Promise<Response>
```

### Session Context Interface (Client-side)

```typescript
interface AuthContext {
  book?: string       // "1" if booking intent
  utm_source?: string // gmb, walkin, etc.
  utm_campaign?: string
  utm_medium?: string
  leadId?: string     // Meta ad lead reference
  service?: string    // Pre-selected service slug
}

// Storage key
const AUTH_CONTEXT_KEY = 'rgss_auth_context'

// Save before OAuth redirect
function saveAuthContext(context: AuthContext): void

// Read after OAuth return
function getAuthContext(): AuthContext | null

// Clear after onboarding complete
function clearAuthContext(): void
```

### Sign-In Page Component Interface

```typescript
// Server component (page.tsx)
export const metadata: Metadata = {
  title: 'Sign In | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

// Client component
interface SignInCardProps {
  // No props needed — reads context from URL/sessionStorage
}

type SignInState = 'idle' | 'redirecting' | 'error'
```

### Onboarding Page Component Interface

```typescript
// Server component fetches session for prefill
interface OnboardingPageProps {
  // Next.js page props (no custom params)
}

// Client component
interface OnboardingFormProps {
  userName: string
  userEmail: string
}

interface OnboardingFormData {
  name: string
  phone: string
  dateOfBirth: string
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say'
  privacyConsent: boolean
  analyticsConsent: boolean
  marketingConsent: boolean
}
```

## Data Models

### Existing Tables Used (from `packages/db/src/schema/`)

#### `user` table (auth.ts)
| Column | Type | Notes |
|--------|------|-------|
| id | text (nanoid) | Primary key |
| name | text | From Google profile, editable on onboarding |
| email | text | Unique, from Google |
| emailVerified | boolean | Set by Better Auth |
| image | text | Google avatar URL |
| role | text | RBAC role (customer, staff, receptionist, manager, owner, developer) |
| banned | boolean | Ban flag |
| banReason | text | Optional ban reason |
| banExpires | timestamptz | Optional ban expiry |
| createdAt | timestamptz | Auto |
| updatedAt | timestamptz | Auto |

#### `session` table (auth.ts)
| Column | Type | Notes |
|--------|------|-------|
| id | text (nanoid) | Primary key |
| userId | text | FK → user.id |
| expiresAt | timestamptz | Session expiry |
| token | text | Unique session token |
| ipAddress | text | Client IP |
| userAgent | text | Client UA |
| createdAt | timestamptz | Auto |
| updatedAt | timestamptz | Auto |

#### `account` table (auth.ts)
| Column | Type | Notes |
|--------|------|-------|
| id | text (nanoid) | Primary key |
| userId | text | FK → user.id |
| accountId | text | Google account ID |
| providerId | text | 'google' |
| accessToken | text | OAuth access token |
| refreshToken | text | OAuth refresh token |
| idToken | text | OIDC ID token |
| accessTokenExpiresAt | timestamptz | Token expiry |
| scope | text | Granted scopes |
| createdAt | timestamptz | Auto |
| updatedAt | timestamptz | Auto |

#### `customer_profile` table (profile.ts)
| Column | Type | Notes |
|--------|------|-------|
| id | text (nanoid) | Primary key |
| userId | text | FK → user.id, unique |
| phone | text | Indian mobile (10 digits) |
| gender | enum | male/female/other/prefer_not_to_say |
| dateOfBirth | date | DD/MM/YYYY display |
| marketingConsent | boolean | DPDP Act compliance |
| marketingConsentAt | timestamptz | When consent was given |
| acquisitionSource | text | organic/gmb/walkin/meta_ad |
| utmSource | text | Raw UTM source |
| utmCampaign | text | Raw UTM campaign |
| utmMedium | text | Raw UTM medium |
| createdAt | timestamptz | Auto |
| updatedAt | timestamptz | Auto |

### Client-Side Storage Models

#### `sessionStorage['rgss_auth_context']` (JSON)
```json
{
  "book": "1",
  "utm_source": "gmb",
  "utm_campaign": null,
  "utm_medium": null,
  "leadId": null,
  "service": "classic-facial"
}
```

#### `localStorage['rgss_cookie_consent']` (JSON)
```json
{
  "v": 1,
  "analytics": true,
  "marketing": false,
  "ts": "2025-06-15T10:30:00.000Z"
}
```

## Error Handling

### Auth API Route Errors
| Scenario | HTTP Status | Error Code | User Action |
|----------|-------------|------------|-------------|
| OAuth provider error | 302 (redirect) | N/A | Redirect to /sign-in with error param |
| Invalid callback state | 400 | `AUTH_INVALID_STATE` | Show error on sign-in page |
| Account already linked | 409 | `AUTH_ACCOUNT_EXISTS` | Show "already signed in" message |

### Middleware Errors
| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| No session on protected route | 302 | Redirect to `/sign-in` |
| Insufficient role for /admin/* | 403 | Forbidden response |
| No profile (not on /onboarding) | 302 | Redirect to `/onboarding` |
| Session validation failure | 302 | Redirect to `/sign-in` (treat as expired) |

### Onboarding API Errors
| Scenario | HTTP Status | Error Code | Details |
|----------|-------------|------------|---------|
| Not authenticated | 401 | `UNAUTHORIZED` | No session cookie |
| Invalid body | 400 | `VALIDATION_ERROR` | Zod field errors |
| Profile already exists | 409 | `PROFILE_EXISTS` | User already onboarded |
| Database write failure | 500 | `INTERNAL_ERROR` | Logged to Sentry |

### Sign-In Page Errors
| Scenario | UI State | Message |
|----------|----------|---------|
| Popup blocked | Error | "Sign-in failed. Please allow popups or try again." |
| OAuth rejected | Error | "Sign-in failed. Please try again." |
| Network error | Error | "Connection failed. Check your internet and try again." |

## Testing Strategy

### Unit Tests (Vitest)
- **Acquisition source resolution**: Test all input combinations (leadId, utmSource values, empty) produce correct output
- **Role hierarchy comparison**: Test that level comparisons correctly allow/deny access
- **Onboarding validation schema**: Test Zod schema accepts valid inputs and rejects invalid ones (phone format, missing required fields)

### Integration Tests (Vitest + MSW)
- **Onboarding API**: Mock auth session, test profile creation, 409 on duplicate, 400 on invalid input
- **Middleware**: Mock `auth.api.getSession`, test redirect logic for each scenario

### E2E Tests (Playwright)
- **Sign-in flow**: Use `storageState` with pre-authenticated session (no real Google OAuth in CI)
- **Onboarding flow**: Navigate to /onboarding with mocked session, fill form, verify redirect
- **RBAC enforcement**: Test that staff role gets 403 on /admin, receptionist gets through

## Correctness Properties

### Property 1: Role Hierarchy Enforcement
**Validates: Requirements 4.3**

For any user with role R attempting to access a route requiring minimum role M, access is granted if and only if `ROLE_LEVELS[R] >= ROLE_LEVELS[M]`.

### Property 2: Onboarding Idempotency
**Validates: Requirements 7.4**

The onboarding API returns 409 for any user who already has a `customer_profile` record — duplicate profile creation is impossible.

### Property 3: Session Context Round-Trip
**Validates: Requirements 8.1, 8.2, 8.3**

For any set of UTM/booking parameters present when sign-in is initiated, those same parameters are available to the onboarding API after the OAuth redirect completes (sessionStorage preservation).

### Property 4: Acquisition Source Determinism
**Validates: Requirements 7.2**

Given the same Session_Context input, the acquisition source resolution always produces the same output (pure function, no randomness).

### Property 5: Authentication Gate Completeness
**Validates: Requirements 4.1, 4.2, 4.7**

Every route in the `config.matcher` list requires a valid session — there is no path through the middleware that allows unauthenticated access to protected routes.
