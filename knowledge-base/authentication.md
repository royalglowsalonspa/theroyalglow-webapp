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
- TypeScript-first, clean architecture for Bun + Next.js 16.2.9 App Router
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
- No access to admin app (`admin.theroyalglow.in`)

### 3. Receptionist (`receptionist`)
- Lowest admin role; works at one branch (one Receptionist per branch)
- Manages bookings, customer check-in, billing, memberships, and leave approvals

### 4. Manager (`manager`)
- Runs one or more branches: staff (Stylists and Therapists), services, reports, scheduling, and settings

### 5. Owner (`owner`)
- Owns one or more branches, with full business access to them, including choosing their Manager and Receptionist at `admin.theroyalglow.in/users`

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

Before starting Google OAuth, store any booking/acquisition context in `sessionStorage` so it survives the OAuth redirect:
- `https://theroyalglow.in` with no UTM → default new customer source `organic`
- `https://theroyalglow.in/?book=1&utm_source=gmb` → preserve `book=1` and source `gmb`
- `https://theroyalglow.in/?book=1&utm_source=walkin` → preserve `book=1` and source `walkin`
- `/book` lead conversion → preserve `leadId` and resolve source `meta_ad` by lead ID or normalized phone

**Why sessionStorage is needed:** The Google OAuth flow redirects the user away from your site (to `accounts.google.com`) and then back to `/api/auth/callback/google`. By the time they return, the original URL query params (`?book=1&utm_source=gmb`) are gone from the browser address bar. `sessionStorage` survives same-tab navigations including OAuth redirects — so the saved context is still there when the user lands on `/onboarding`.

**Implementation flow:**
```
Customer arrives at /?book=1&utm_source=walkin
    ↓
JavaScript saves to sessionStorage:
  { book: "1", utm_source: "walkin" }
    ↓
Customer clicks "Sign in with Google" → redirected to Google
    ↓ (sessionStorage SURVIVES the redirect — same browser tab)
Customer returns from Google → lands on /onboarding
    ↓
Onboarding reads sessionStorage → finds utm_source = "walkin"
    ↓
✅ customer_profile.acquisition_source = 'walkin' (CORRECT!)
✅ After onboarding → redirect to / → reads book=1 → dialog auto-opens
    ↓
sessionStorage cleared after successful write
```

**Without this:** Every first-time customer who signs in during their first visit gets incorrectly tagged as `organic` — GMB attribution, walk-in tracking, and Meta ad ROAS all break silently.

**Onboarding before booking.** A customer may skip onboarding and keep browsing; the homepage asks again at most once every 24 hours. A booking always needs the profile, and the customer is asked for it before they fill one in:

- **Signed in, no profile, taps Book Now** (every Book Now link is `/?book=1`): the homepage redirects to `/onboarding?book=1` plus any `utm_*`, `leadId` and `service` parameters, before the booking dialog opens (`requireProfileBeforeBooking` in `apps/web/src/lib/onboarding-guard.ts`). This applies to every role and ignores the 24-hour quiet window. After onboarding the customer goes straight back to `/?book=1`.
- **Signed out:** the dialog opens and the customer picks the booking. "Sign in to Book" saves the selections. A first-time customer is onboarded straight after Google sign-in; a returning customer without a profile comes back to `/?book=1` and is redirected to onboarding as above. Either way the dialog then reopens at the summary.
- **Backstop:** `POST /api/bookings` and `POST /api/gems/redeem` answer `403 ONBOARDING_REQUIRED` without a profile. The dialog then saves the selections and sends the customer to `/onboarding`.

After submission: the name the customer confirmed or corrected is saved to `user.name` (through Better Auth, which also refreshes the session cookie cache) → `customer_profile` record created with first-touch `acquisition_source` (`organic`, `gmb`, `walkin`, or converted `meta_ad`), in the same transaction as the consent receipt in `audit_log` (Privacy Policy required; analytics and marketing optional; see `audit_log` in [database-schema.md](database-schema.md)) → consent choices also written to `rgss_cookie_consent` in localStorage → redirect to `/` (homepage). If `book=1` was preserved, the homepage booking dialog re-opens after onboarding. Cookie banner will not re-ask for categories already consented to here.

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

Since the Better Auth Cloud dashboard is generic (not branded), people are managed in the Royal Glow admin portal, **one branch at a time** (multi-branch support, `.kiro/specs/multi-branch-support/`). The sidebar's branch switcher picks the active branch; every screen and API below works on that branch only.

Canonical application role values: `customer` · `staff` · `receptionist` · `manager` · `owner` · `developer`. Since migration `0004`–`0006`, a branch role is a relationship, not just a value:

| Role | Held through | Rule enforced by the database |
|------|--------------|-------------------------------|
| Owner | `branch.owner_user_id` | Every branch has one; an Owner owns at least one branch and holds no other role |
| Manager | `branch.manager_user_id` + an active `staff_profile` (no branch) | One per branch; may manage several branches; manages at least one |
| Receptionist | active `staff_profile` at one branch | One per branch |
| Staff (Stylist, Therapist) | active `staff_profile` at one branch | Any number |
| Developer | `user.role` | Exactly one account |

**Who changes what** (planned by `planBranchRoleChange` in `packages/business/src/branch/roles.ts`, applied by `applyBranchRolePlan` in `packages/db/src/queries/branch-roles.ts`):

| Change | Where | Who |
|--------|-------|-----|
| Owner of a branch (handover) | Users & Roles (`/users`) | Developer only |
| Manager, Receptionist: choose or remove | Users & Roles (`/users`) | The branch's Owner, or the Developer |
| Stylists and Therapists: add, edit, remove | Staff (`/staff`) | The branch's Manager, its Owner, or the Developer |
| Create a branch (with its Owner), edit branch details | Branches (`/branches`) | Developer only |

- Nobody changes their own role, and the Developer account is never changed in the app.
- Someone who loses their last role becomes a Customer and is signed out (their sessions are deleted). Their account, customer data and history are kept; adding them again later reactivates the same staff profile.
- Every change is one transaction: it locks the people and branches involved, re-checks every row the decision was made from, writes the role, branch, profile and audit entry together, and is refused (409, "reload and try again") if anything changed meanwhile. A form carries the branch it was rendered for, so a tab left open across a branch switch is refused too.
- Roles are re-read from the database on every admin request, so the session's cached copy (up to 5 minutes old) never grants anything.

Intended accounts: Owner = `royalglowsalonspa@gmail.com`, Developer = `katbose.dev@gmail.com`.

### Changing the Developer — database only

The new person signs in once on `theroyalglow.in` (this creates their `user` row). Then, in the Neon SQL editor on the right branch (`dev`, then `prod`):

```sql
-- Replacing the Developer: one transaction, and demote BEFORE promoting.
-- Each UPDATE must report 1 row; if not, run ROLLBACK instead of COMMIT.
BEGIN;
UPDATE "user" SET role = 'customer', updated_at = now()
WHERE lower(email) = lower('old.developer@example.com');
UPDATE "user" SET role = 'developer', updated_at = now()
WHERE lower(email) = lower('new.developer@example.com');
-- Sign the old Developer out everywhere, as the app does when a role is lost.
DELETE FROM session
WHERE user_id = (SELECT id FROM "user" WHERE lower(email) = lower('old.developer@example.com'));
COMMIT;

-- First Developer on a database branch that has none: the promote UPDATE alone,
-- or `bun run packages/db/scripts/set-role.ts <email> developer`.
```

The database allows exactly one Developer: the unique index `user_one_developer` rejects a second one as soon as it is written, and the deferred trigger `user_role_relationships` rejects losing the last one at `COMMIT`. Demoting first, inside one transaction, satisfies both. A wrong address can't leave the database with no Developer or with two: if the old address matches nothing, the promote fails at once on `user_one_developer`; if the new one matches nothing, `COMMIT` is refused with "The Developer can only be replaced, not removed". Checked on dev in direct SQL on 25/10/2026 (demote then promote passes both guards; promote first fails on the index; demote alone fails at `COMMIT`), rolled back each time. Other branch roles can't be set with a single `UPDATE` any more; the database rejects it, so use the admin screens above. `set-role.ts` only handles `customer` and the first `developer`.

The change applies to new requests at once; the edge middleware's cached copy refreshes within 5 minutes (signing out and in refreshes it immediately). The old Developer's open live updates stop within 13 minutes, when their last realtime token expires. Database edits are not written to `audit_log`, so note who and why in the change log.

Better Auth Cloud's dashboard (`dash()` plugin endpoints under `/api/auth/dash/*`) can also edit users. Its user-editing endpoints reject every request unless `BETTER_AUTH_API_KEY` is configured (checked 25/10/2026 in `@better-auth/infra` 0.4.20), and the SST deployment does not set it. Treat connecting the dashboard as a database-level access decision; the role relationships above still apply to its writes.

This gives a **branded, in-product user management UI** that matches the premium feel of the rest of the site.

---

## Trade-offs Accepted

| Trade-off | Mitigation |
|-----------|-----------|
| No built-in visual admin dashboard (vs Clerk/WorkOS) | Build `admin.theroyalglow.in/users` page — one afternoon of work |
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
