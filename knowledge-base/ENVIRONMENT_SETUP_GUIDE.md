# Environment Variables — Setup Guide & Current Status

**Audience:** the project owner (solo dev). This explains every env var the app uses,
which file it lives in, whether you have it set today, and exactly what to focus on to
get the **Payload CMS → website integration** working locally and in production.

> Secret values are NEVER printed in this document. Items are listed by KEY NAME only.

---

## 0. TL;DR — what to focus on RIGHT NOW

For the Payload integration (your current priority), only a tiny subset matters:

| Priority | Variable | File | Status | Why it matters |
|----------|----------|------|--------|----------------|
| 🔴 BLOCKER | `PAYLOAD_SECRET` | `apps/cms/.env.local` | ✅ **NOW SET** (I generated a 32-byte secret) | Payload refuses to run / is insecure without it |
| 🟢 done | `DATABASE_URL` | `apps/cms/.env.local` | ✅ set (dev branch) | Payload stores its `cms_*` tables here |
| 🟢 done | `PAYLOAD_PUBLIC_SERVER_URL` | `apps/cms/.env.local` | ✅ `http://localhost:3002` | admin/API base URL |
| 🟢 done | `WEB_APP_URL` | `apps/cms/.env.local` | ✅ `http://localhost:3000` | CORS/CSRF allow-list |
| 🟢 done | `NEXT_PUBLIC_CMS_URL` | `apps/web/.env.local` | ✅ `http://localhost:3002` | web app reads CMS from here |
| 🟡 later | `NEXT_PUBLIC_R2_PUBLIC_URL` | both | ⚪ empty | only needed for **R2-hosted** images (see §4) |
| 🟡 later | `R2_*` (bucket/endpoint/keys) | both | ⚪ empty | uploads use **local disk** until set — fine for dev |

**Bottom line:** the CMS was missing exactly ONE required variable — `PAYLOAD_SECRET` —
which is now set. You can run the CMS locally immediately. Everything else needed for
local integration was already in place.

---

## 1. How env files work in this monorepo

There are **four** real env files (plus two templates). Each app loads its OWN file —
they do NOT share automatically:

| File | Loaded by | Purpose |
|------|-----------|---------|
| `apps/web/.env.local` | Next.js web app (port 3000) | All web-app runtime vars |
| `apps/cms/.env.local` | Payload CMS (port 3002) | CMS-only vars |
| `packages/db/.env` | `drizzle-kit` (migrations) | DB connection for schema migrations |
| `.env.example` (root) | template only | Canonical list of ALL vars — copy from here |
| `apps/cms/.env.example` | template only | CMS-only subset template |
| `packages/db/.env` | drizzle-kit | already set (dev branch) |

Validation: `apps/web/src/env.ts` uses **t3-env + Zod** to validate web vars at build
time. The web `.env.local` currently has **`SKIP_ENV_VALIDATION=1`**, which turns that
validation OFF so the app builds even with blank keys. The CMS does NOT use t3-env — it
reads `process.env` directly in `payload.config.ts`, which is why a blank `PAYLOAD_SECRET`
silently breaks it rather than failing a nice validation step.

---

## 2. CMS env (`apps/cms/.env.local`) — full status

| Variable | Required? | Status | Notes |
|----------|-----------|--------|-------|
| `PAYLOAD_SECRET` | **required** | ✅ set now | min 32 chars; signs/encrypts sessions |
| `DATABASE_URL` | **required** | ✅ set | same Neon dev branch as web; Payload owns `cms_*` tables |
| `PAYLOAD_PUBLIC_SERVER_URL` | **required** | ✅ set | `http://localhost:3002` |
| `WEB_APP_URL` | **required** | ✅ set | `http://localhost:3000` — drives CORS/CSRF |
| `R2_BUCKET_NAME` | for R2 | ✅ set (`theroyalglow-uploads`) | name only; needs the keys below to work |
| `R2_ENDPOINT` | for R2 | ⚪ empty | uploads fall back to local disk until set |
| `R2_ACCESS_KEY_ID` | for R2 | ⚪ empty | |
| `R2_SECRET_ACCESS_KEY` | for R2 | ⚪ empty | |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | for R2 | ⚪ empty | public CDN base for media URLs |

**Run the CMS locally:**
```
cd apps/cms
bun run dev        # serves http://localhost:3002/admin
```
First run will create the admin user. Add content in the collections, then the web app
(once wired per PAYLOAD_INTEGRATION_PLAN.md) reads it via `NEXT_PUBLIC_CMS_URL`.

---

## 3. Web env (`apps/web/.env.local`) — full status

`SKIP_ENV_VALIDATION=1` is currently ON, so blank required keys do NOT break the build.
When you remove it (recommended before production), every "required" row below must be
filled or the build fails.

### Required by `env.ts` — currently SET ✅
- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_POSTHOG_HOST` (has a default)

### Required by `env.ts` — currently EMPTY ⚪ (masked by SKIP_ENV_VALIDATION)
These will block a validated/production build until filled:
- `RESEND_API_KEY` — transactional email (booking/invoice). Needed before bookings go live.
- `ABLY_PRIVATE_KEY`, `NEXT_PUBLIC_ABLY_KEY` — realtime booking status.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — cache + rate limiting.
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` — background jobs.
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — file storage.
- `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — web push.
- `META_PIXEL_ACCESS_TOKEN`, `NEXT_PUBLIC_META_PIXEL_ID` — ads/conversion tracking.
- `NEXT_PUBLIC_POSTHOG_KEY` — analytics.

### Optional (safe to leave blank locally)
- `BREVO_API_KEY`, `AISENSY_*`, `SLACK_WEBHOOK_URL`, `DAILY_REPORT_EMAIL_RECIPIENTS`,
  `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_CLARITY_ID`, `BETTER_STACK_*`, `PDF_API_URL`,
  `CLOUDFLARE_*`, `BETTER_AUTH_SECRET` (you're using Cloud/API-key mode), `META_TEST_EVENT_CODE`.

### CI/CD only (put in GitHub Actions secrets, NOT in `.env.local`)
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `BETTER_STACK_HEARTBEAT_PPRD_SYNC`, `BETTER_STACK_HEARTBEAT_BACKUP`,
  `BETTER_STACK_DEPLOY_WEBHOOK`, `BETTER_STACK_INCIDENT_WEBHOOK`
- `AWS_DEPLOY_ROLE_ARN` (GitHub OIDC), `INTERNAL_JOB_TOKEN`

---

## 4. Images: when do you need R2?

The web app's image resolver (`apps/web/src/lib/cms/media.ts`) builds absolute image URLs
like this:
1. If the Payload media URL is already absolute (`https://…`) → use as-is.
2. Else prefix with `NEXT_PUBLIC_R2_PUBLIC_URL` if set.
3. Else fall back to `NEXT_PUBLIC_CMS_URL` (the CMS origin).

So:
- **Local dev (no R2):** uploads are served from the CMS origin (`localhost:3002`). Images
  work WITHOUT R2 — you just need `next.config.ts` `images.remotePatterns` to allow
  `localhost:3002` (see PAYLOAD_INTEGRATION_PLAN.md §2). This block is currently MISSING in
  `next.config.ts` and must be added if you use `next/image`.
- **Production:** set up R2 (`R2_*` + `NEXT_PUBLIC_R2_PUBLIC_URL`) so media is served from a
  fast CDN domain instead of the Render-hosted CMS origin.

---

## 5. Production env (when you deploy)

You'll maintain a SEPARATE set of values per environment (dev/test/pprd/prod), pointed at
the matching Neon branch and live service URLs:
- `DATABASE_URL` → the env's Neon branch (prod branch for prod, etc.)
- `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` → `https://theroyalglow.in`
- `NEXT_PUBLIC_CMS_URL`, `PAYLOAD_PUBLIC_SERVER_URL` → `https://admin.theroyalglow.in`
- `WEB_APP_URL` (CMS) → `https://theroyalglow.in`
- `PAYLOAD_SECRET` → a DIFFERENT, fresh secret for prod (do not reuse the dev one)
- Google OAuth → add the prod redirect URI `https://theroyalglow.in/api/auth/callback/google`
- All the "currently empty required" web vars → must be filled.

Web, admin and CMS are hosted on Render today (AWS EC2 next — see M2AWS.md). Set these in each
platform's environment settings (not in committed files).

---

## 6. Security notes (important)

- ✅ Both `.env.local` files are gitignored (verified) — they will not be committed.
- ⚠️ Your `.env.local` files contain REAL, working credentials (Neon DB password, Google
  OAuth client secret, Better Auth API key, Neon API key). Treat that machine/file as
  sensitive. If any of these files is ever shared, pasted, or synced to a public location,
  **rotate those credentials immediately** (new DB password, new OAuth secret, new keys).
- Note: these files live under a OneDrive-synced folder. OneDrive sync is not "public", but
  be aware your secrets are replicated to Microsoft's cloud. For stronger hygiene, consider
  moving the repo outside OneDrive or excluding it from sync.
- Use a fresh `PAYLOAD_SECRET` for production — different from the local dev one.
- The Google OAuth **client ID** is public (used by One Tap in the browser); the **client
  secret** is not — keep it server-side only.

---

## 7. Recommended focus order

1. ✅ **CMS runnable** — `PAYLOAD_SECRET` set. Run `cd apps/cms && bun run dev`, create the
   admin user, add a couple of testimonials/offers to test.
2. **Add `images.remotePatterns`** to `apps/web/next.config.ts` (currently missing) so
   `next/image` can load CMS media — see PAYLOAD_INTEGRATION_PLAN.md §2.
3. **Wire the sections** per PAYLOAD_INTEGRATION_PLAN.md §7 (Testimonials → Offers →
   Service cards → Services → Team → Banner → verify FAQ/Gallery/Blog).
4. **Before bookings go live:** fill `RESEND_API_KEY` (confirmation/invoice emails).
5. **Before realtime/jobs:** fill `ABLY_*`, `UPSTASH_*`, `QSTASH_*`.
6. **Before production launch:** R2 (`R2_*` + `NEXT_PUBLIC_R2_PUBLIC_URL`), analytics
   (`POSTHOG`/`META`), push (`VAPID`), observability (`SENTRY`/`BETTER_STACK`), then
   remove `SKIP_ENV_VALIDATION` and fix anything the build flags.

---

*Companion doc: `PAYLOAD_INTEGRATION_PLAN.md` (the full integration brief).*
