# Implementation Plan: Phase 10 — Observability & Launch

## Overview

Wire the observability stack into the running app and ship launch assets: Sentry runtime init (guarded), Microsoft Clarity (consent-gated, extending the Phase 7 Analytics component), a PostHog `posthog-node` feature-flags helper with kill-switch constants, funnel-event wiring via the existing `track()` helper, Checkly synthetic check scripts, the Fumadocs docs site, and a `LAUNCH.md` runbook. Everything is a guarded extension point — with NO keys the providers are inert, consent still gates analytics/heatmaps, and the monorepo typechecks/lints/builds. Verification: `SKIP_ENV_VALIDATION=1 bun run typecheck`, `bun run lint`, `bun run build` (web), and the docs app builds independently.

## Tasks

- [x] 1. Sentry runtime init (guarded) + API capture
  - Add `@sentry/nextjs` to `apps/web` deps; run `bun install`
  - Create `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`: each `Sentry.init({...})` ONLY when `process.env.NEXT_PUBLIC_SENTRY_DSN` is set; `environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'`, `release: process.env.COMMIT_SHA`, `tracesSampleRate: 0.1`, `enabled: process.env.NODE_ENV === 'production'`, `sendDefaultPii: false`
  - Create `apps/web/instrumentation.ts`: `export async function register()` importing the server config on `NEXT_RUNTIME === 'nodejs'` and the edge config on `'edge'`; `export const onRequestError` from `@sentry/nextjs` (`captureRequestError`) per Next 16
  - Edit `apps/web/next.config.ts`: wrap the existing exported config with `withSentryConfig(config, { silent: true })` — must remain a no-op for source-map upload without `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` (CI-only). Preserve the existing `transpilePackages`
  - Edit `apps/web/src/lib/api/error-handler.ts`: in the unexpected-error branch (the `console.error(...)` path, NOT the `AppError` branch), call `Sentry.captureException(error)` via a guarded import so it is a no-op when Sentry is uninitialised; keep the existing 500 response shape unchanged
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Microsoft Clarity loader (consent-gated) in Analytics.tsx
  - Edit `apps/web/src/components/analytics/Analytics.tsx`: add a `loadClarity()` alongside `loadPostHog()`/`loadMetaPixel()`, called from `evaluateConsent()` when `consent.analytics === true` AND `process.env.NEXT_PUBLIC_CLARITY_ID` is set. Inject the standard Clarity snippet once (guard via a module-level flag and/or `window.clarity` existence). No-op when consent withheld or id absent; wrap in try/catch with the existing `logDevError`. Add a minimal typed `window.clarity` augmentation (no `any`)
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. PostHog feature flags helper — lib/flags.ts
  - Add `posthog-node` to `apps/web` deps; run `bun install`
  - Create `apps/web/src/lib/flags.ts`: export `FLAGS` const map (`bookingEnabled: 'booking-enabled'`, `membershipEnabled`, `offersEnabled`, `whatsappNotifications`, `gemsLoyalty`, `spaServices`) `as const`; export `async function isFeatureEnabled(flag: string, distinctId: string, defaultValue = false): Promise<boolean>` — guarded dynamic import of `posthog-node`; if `process.env.NEXT_PUBLIC_POSTHOG_KEY` absent or evaluation throws → return `defaultValue` (never throw). Lazy shared client with `host` from `process.env.NEXT_PUBLIC_POSTHOG_HOST`. Read keys via `process.env` directly (build-safe). No `any`
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Funnel-event wiring (extend events.ts + call sites)
  - Edit `apps/web/src/lib/analytics/events.ts`: extend the `AnalyticsEvent` union with the `observability.md` product events: `'booking_started' | 'booking_step_completed' | 'booking_request_submitted' | 'lead_form_submitted' | 'offer_clicked'` (keep the existing Meta standard events; route non-standard ones via `trackCustom`)
  - Wire light-touch `track(...)` calls (client components, fire-and-forget, no-op-safe): booking dialog open → `track('booking_started')`; step advance → `track('booking_step_completed', { step })`; submit success → `track('booking_request_submitted', { bookingId })`; lead form submit success → `track('lead_form_submitted')`; offer CTA click → `track('offer_clicked', { offerId })`. READ the booking dialog + offers + lead-form components first; add only at clean points, do NOT add business logic or break existing behaviour
  - _Requirements: 4.1, 4.2_

- [x] 5. Checkly synthetic checks — tests/synthetic/
  - Add `checkly` to root devDependencies; run `bun install`
  - Create `tests/synthetic/checkly.config.ts`: project config (logicalId `rgss`, checkMatch, default `runtimeId`, locations, base via `process.env.CHECKLY_TARGET_URL ?? 'https://theroyalglow.in'`)
  - Create the 5 `*.check.ts` (Playwright-compatible browser checks) per `observability.md` with the documented schedules: `homepage.check.ts` (10 min — homepage + services render), `booking-slots.check.ts` (15 min — `?book=1` dialog slots load), `signin.check.ts` (30 min — sign-in renders), `admin-dashboard.check.ts` (30 min — admin loads; note auth via a test account env, ops), `health.check.ts` (5 min — `/api/health` responds < 500ms). Delivered as code; activation is ops
  - _Requirements: 5.1, 5.2_

- [x] 6. Fumadocs docs site scaffold — docs/
  - Build `docs/` into a Fumadocs Next.js app. Edit `docs/package.json` (add `next`, `react`, `react-dom`, `fumadocs-ui`, `fumadocs-core`, `fumadocs-mdx`; scripts `dev`/`build`/`start`/`postinstall` for `fumadocs-mdx`). Create `docs/next.config.mjs` (`createMDX()` wrap), `docs/source.config.ts`, `docs/tsconfig.json`, the `app/` tree (root layout, `(docs)` layout, `[[...slug]]` page, `api/search/route.ts`), `lib/source.ts`, and `content/docs/`: `index.mdx` (project overview), `architecture.mdx` (HLD summary linking repo docs), `api-reference.mdx` (placeholder noting `fumadocs-openapi` auto-gen is a follow-up). Must build independently (`bun run build --filter=@rgss/docs`); NOT added to `apps/web` transpilePackages
  - _Requirements: 6.1, 6.2_

- [x] 7. LAUNCH.md runbook + verification
  - Create `LAUNCH.md` at repo root: condensed runbook derived from `launch-checklist.md` — the T-72h→T+24h timeline, the three Go/No-Go gates, and a "code vs ops" table; cross-reference `/api/health`, the Phase 9 workflows, and canonical env names from `environment-variables.md`
  - Run `SKIP_ENV_VALIDATION=1 bun run typecheck` workspace-wide; resolve type errors in new files (no `any`, no `@ts-ignore` beyond a single justified guarded import). Run `bun run lint` (Biome); fix genuine new issues (ignore the CRLF/import-order baseline). Run `bun run build` for `@rgss/web` (with `withSentryConfig`, no Sentry token) and `bun run build --filter=@rgss/docs` — both succeed. Confirm with no observability keys: no Sentry init, no Clarity, `isFeatureEnabled` returns defaults, `track()` no-ops, `/api/health` 200
  - _Requirements: 1.4, 2.3, 3.2, 4.2, 7.1, 7.2_

## Notes

- Mirrors `observability.md` (5 layers) and `launch-checklist.md` (runbook). Phases 6–9 already provide BetterStack heartbeat pings, the consent-gated PostHog/Meta Pixel loader, and `/api/health` — Phase 10 EXTENDS those, it does not duplicate them.
- Guarded everywhere: Sentry/Clarity/PostHog/flags read keys from `process.env` (or `@/env` where already validated) behind truthy guards; absent keys → inert. Consent still gates Clarity (analytics) and PostHog (analytics) / Meta Pixel (marketing). Sentry loads independent of consent (operational telemetry) but `sendDefaultPii: false`.
- Feature-flag kill-switches default ON for core features so a PostHog outage never disables booking/membership/offers; experimental flags default OFF.
- `track()` (Phase 7) is already no-op-safe — funnel wiring just adds call sites at clean points; no business logic in components.
- Checkly scripts + Fumadocs site are their own concerns: `checkly` is a devDependency (ops-run); `docs/` is an independent workspace app, never in the web bundle. Both must not break the web/cms build.
- `withSentryConfig` is inert for source-map upload without `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` (CI-only); the Phase 9 `deploy-prod.yml` already has the upload step.
- No DB schema changes. No money/date handling introduced.
- PowerShell verification: `cd apps/web; $env:SKIP_ENV_VALIDATION=1; bunx tsc --noEmit` (POSIX `VAR=1 cmd` fails on this shell).
- Provisioning Sentry/BetterStack/PostHog/Clarity/Checkly accounts, DNS, secrets, monitors, and launch-day execution are OPS steps per `launch-checklist.md` — this phase delivers the code/config they switch on.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3", "5", "6"] },
    { "id": 1, "tasks": ["4"] },
    { "id": 2, "tasks": ["7"] }
  ]
}
```
