# Authentication

## Decision: Better Auth

After comparing all major options, **Better Auth** is the chosen auth library.

---

## Auth Provider Comparison

| Provider | Branding on Google OAuth | RBAC Built-in | Cost (free plan) | Notes |
|----------|--------------------------|---------------|------------------|-------|
| **Better Auth** ✅ | ✅ Your domain shown | ✅ Built-in plugin | $0 forever | **Winner** |
| Supabase Auth | ❌ `*.supabase.co` shown | ❌ Manual | $0 | Branding fail on free plan |
| Auth.js v5 | ✅ | ❌ Manual wiring | $0 | No RBAC plugin, more setup |
| Clerk | ✅ | ✅ | ❌ Pro only for custom domain | Best DX, budget option later |
| WorkOS AuthKit | ✅ | ✅ | Paid | Good dashboard, not free |
| Auth0 | ✅ | ✅ | Limited free tier | Overkill, complex |

### Why Supabase Auth was ruled out
On the free plan, Google OAuth callback runs through `*.supabase.co` — so Google's consent screen shows `supabase.co`, not "Royal Glow Salon & Spa". Upgrading to remove this requires a paid Supabase plan. Not acceptable.

### Why Better Auth wins
- OAuth callback runs on **your own server** (`theroyalglow.in/api/auth/callback/google`)
- Google consent screen shows **"Royal Glow Salon & Spa"** with your domain
- Built-in **roles & permissions plugin** (RBAC)
- TypeScript-first, clean architecture for Bun + Next.js 16.2.6 App Router
- All user data (sessions, accounts, verifications) stored in **your own Neon DB** (PostgreSQL, managed by Drizzle ORM)
- Better Auth Cloud free tier provides dashboard + audit logs

---

## Google OAuth Setup

1. Create OAuth 2.0 credentials in **Google Cloud Console**
2. Set app name: `Royal Glow Salon & Spa`
3. Upload logo
4. Set authorized callback URL: `https://theroyalglow.in/api/auth/callback/google`
5. This ensures the Google consent screen shows your brand name and domain

**Sign-in method: Google OAuth only** — no password auth, no magic links, no email/password.

---

## User Roles

The application uses **six concrete RBAC roles** via Better Auth:

### 1. Customer (`customer`)
- Real end users booking services
- Access: public-facing website, their own booking history, profile, invoices

### 2. Staff (`staff`)
- Stylist / Therapist role
- Access: own schedule, assigned booking notes, leave requests
- No access to `/admin/*`

### 3. Receptionist (`receptionist`)
- Lowest admin role
- Manages bookings, customer check-in, billing, memberships, and leave approvals

### 4. Manager (`manager`)
- Full operational access across staff, services, reports, scheduling, and settings

### 5. Owner (`owner`)
- Full business access, including `/admin/users`

### 6. Developer (`developer`)
- Full access to everything
- Additional access to developer-only integrations and log surfaces

---

## First-Time User Onboarding

On first Google sign-in, redirect to `/onboarding` to collect:
- Full name *(pre-filled from Google, editable)*
- Email *(pre-filled from Google, read-only)*
- Phone number *(fetched from Google People API if available, else manual entry)*
- Date of birth *(manual entry, DD/MM/YYYY)*
- Gender *(select: Male / Female / Other / Prefer not to say)*
- **Consent checkboxes:**
  - ☑ **Required:** "I agree to the Privacy Policy. My data is stored securely on Indian servers and will not be shared with any third-party organization." *(links to /privacy)*
  - ☐ **Optional:** "Help us improve Royal Glow — allow anonymous usage analytics." *(analytics consent — DPDP Act. Seeds `analytics: true` in `rgss_cookie_consent`; PostHog + Clarity load for this user. Cookie banner suppressed for analytics category.)*
  - ☐ **Optional:** "Send me offers, updates & promotions via email and notifications." *(marketing consent — DPDP Act. Seeds `marketing: true` in `rgss_cookie_consent`; Meta Pixel + CAPI enabled. Cookie banner suppressed for marketing category.)*

Before starting Google OAuth, store any booking/acquisition context in session/local storage so it survives the redirect:
- `https://theroyalglow.in` with no UTM → default new customer source `organic`
- `https://theroyalglow.in/?book=1&utm_source=gmb` → preserve `book=1` and source `gmb`
- `https://theroyalglow.in/?book=1&utm_source=walkin` → preserve `book=1` and source `walkin`
- `/book` lead conversion → preserve `leadId` and resolve source `meta_ad` by lead ID or normalized phone

After submission: `customer_profile` record created with first-touch `acquisition_source` (`organic`, `gmb`, `walkin`, or converted `meta_ad`) → consent choices written to `rgss_cookie_consent` in localStorage → redirect to `/` (homepage). If `book=1` was preserved, the homepage booking dialog re-opens after onboarding. Cookie banner will not re-ask for categories already consented to here.

---

## Google OAuth Scopes

### Initial Sign-In Scopes

At sign-in, request the **minimal scopes** only:

| Scope | Purpose |
|-------|---------|
| `email` | User identification, login |
| `profile` | Name, avatar for profile pre-fill |
| `https://www.googleapis.com/auth/user.phonenumbers.read` | Phone number pre-fill (Google People API) |

**Why minimal:** Every additional scope makes Google's consent screen longer and scarier. More scopes = lower sign-in conversion.

### Incremental Consent — Google Calendar

Calendar access is requested **later**, not at sign-in.

| Scope | When Requested | Trigger |
|-------|---------------|--------|
| `https://www.googleapis.com/auth/calendar.events` | After first booking is **confirmed** | Prompt: "Add appointments to Google Calendar?" [Allow] |

**Flow:**
```
Customer's first booking gets confirmed by receptionist
    ↓
UI shows: "Add your appointments to Google Calendar?"
            [Allow]   [Not Now]
    ↓ (Allow)
Better Auth triggers incremental OAuth consent for calendar.events scope
    ↓
Google shows Calendar permission prompt
    ↓ (User grants)
Google account now carries the `calendar.events` scope for this user
    ↓
Calendar event created for this confirmed booking
    ↓
All future confirmed bookings can auto-create calendar events while that scope remains granted
```

**Why incremental consent:**
- Asking for Calendar + Email + Profile at sign-in shows a long, intimidating Google permissions page
- Users drop off when they see "Royal Glow wants to: Read and write your calendar" before even booking anything
- Asking **after** a successful booking confirmation is contextually appropriate — "You just got confirmed, want it in your calendar?"
- Google recommends incremental consent as a best practice

**Calendar event contents:**
| Field | Value |
|-------|-------|
| Title | "Royal Glow — [Service Names]" |
| Start/End | Booking date + time |
| Location | Full salon address + Google Maps link |
| Description | Services list, total amount, booking ID |
| Reminders | 24h + 1h before |

**Calendar event lifecycle:**
| Booking Action | Calendar Action |
|---------------|----------------|
| Confirmed | Event created |
| Rescheduled | Event updated (new date/time) |
| Cancelled | Event deleted |
| Rejected | No event (never created for pending) |

---

## Better Auth Cloud Dashboard

Better Auth Cloud **free tier ($0/mo)** provides:

| Feature | Available |
|---------|----------|
| User management | ✅ |
| Session monitoring | ✅ |
| Organization oversight | ✅ |
| User analytics | ✅ |
| Audit log retention | 1 day |
| Dashboard seats | 1 |
| Audit logs/mo | 10,000 |

Architecture: Better Auth Cloud is a **hosted cloud service by Better Auth — you do not host it yourself.** Your app connects to it via an API key. The dashboard is at `better-auth.com/dashboard`. No extra server to set up or maintain.

---

## Custom Admin User Management Panel

Since the Better Auth Cloud dashboard is generic (not branded), expose day-to-day user management through the custom `/admin/users` page in the Royal Glow admin portal:

```ts
// List all users
const users = await auth.api.listUsers()

// Ban a user
await auth.api.banUser({ userId })

// Assign roles — follows the project's role hierarchy:
// Developer assigns Owner
await auth.api.setRole({ userId, role: 'owner' })

// Owner assigns Manager (or any role below)
await auth.api.setRole({ userId, role: 'manager' })

// Manager assigns Receptionist or Staff
await auth.api.setRole({ userId, role: 'receptionist' })
await auth.api.setRole({ userId, role: 'staff' })
```

Canonical application role values: `customer` · `staff` · `receptionist` · `manager` · `owner` · `developer`

**Role assignment hierarchy:**
| Who assigns | Can assign |
|-------------|------------|
| Developer | `owner` (and any role below) |
| Owner | `manager`, `receptionist`, `staff` |
| Manager | `receptionist`, `staff` |

> The `/admin/users` page enforces this hierarchy in the UI — a Manager's role-picker only shows options they are allowed to assign.

This gives a **branded, in-product user management UI** that matches the premium feel of the rest of the site.

---

## Trade-offs Accepted

| Trade-off | Mitigation |
|-----------|-----------|
| No built-in visual admin dashboard (vs Clerk/WorkOS) | Build `/admin/users` page — one afternoon of work |
| Newer library — less community history than Auth.js | Better Auth is actively maintained and TypeScript-native; lower real risk |
| Self-managed security updates | Monitor Better Auth releases; GitHub Dependabot handles this automatically |

---

## Future: Migrate to Clerk?

If budget opens up, **Clerk** is the best-DX option in the market with a beautiful admin dashboard. Migration path from Better Auth → Clerk is feasible but non-trivial. Not needed now.

---

## Testing Auth Flows

- **E2E tests:** Playwright uses `storageState` — authenticates once, reuses session cookies across tests (no Google OAuth popup in CI)
- **Integration tests:** MSW intercepts Google OAuth callback — mocks the token exchange to return a test user
- **Role-based testing:** Separate test accounts per role (customer, receptionist, manager, owner) with pre-configured sessions
- **Rate limiting:** Auth endpoints rate-limited to 10 req/min — tested explicitly in integration suite

> See [testing.md](./testing.md) Section 9 (E2E) for Playwright auth setup and Section 15 (Mocking Strategy) for MSW auth mocking.
