# Requirements Document

## Introduction

Phase 10 wires the observability stack into the running app and ships the supporting launch assets, completing the build. Per `observability.md` the stack is five layers — Sentry (errors), BetterStack (uptime/status/heartbeats/logs), PostHog (product analytics + feature flags), Microsoft Clarity (heatmaps/session replay), and Checkly (synthetic monitoring). Phases 6–9 already provided the BetterStack heartbeat pings, the consent-gated PostHog + Meta Pixel loader, and the `/api/health` endpoint. This phase adds what is missing in code: Sentry runtime init, Microsoft Clarity (consent-gated), a PostHog feature-flags server helper, typed funnel-event wiring into the real flows, Checkly synthetic check scripts, the Fumadocs documentation site, and a launch runbook.

Everything follows the guarded-extension-point convention: with no keys configured, all observability providers are inert, consent still gates analytics/heatmaps, and the monorepo continues to typecheck, lint, and build. Provisioning accounts, DNS, secrets, BetterStack monitors, Checkly runs, and the launch-day execution are ops steps documented in `launch-checklist.md`; this phase delivers the code and config those steps switch on.

Out of scope (deferred/ops): provisioning accounts/DNS/secrets and launch-day execution; BetterStack monitor/status-page creation; running Checkly/k6 against production; Brevo/AiSensy marketing content; full API-reference content (Fumadocs scaffolds with a placeholder; OpenAPI auto-generation is a follow-up); PostHog dashboards/funnels (the feeding events are wired here).

## Glossary

- **Sentry_Runtime**: The `@sentry/nextjs` client/server/edge initialisation, guarded by the Sentry DSN.
- **Clarity_Loader**: The consent-gated Microsoft Clarity script loader, added to the existing Analytics component.
- **Feature_Flags**: The server-side PostHog (`posthog-node`) helper `isFeatureEnabled` plus the typed `FLAGS` constant map.
- **Funnel_Event**: A product-analytics event from `observability.md` (e.g. `booking_started`, `booking_request_submitted`, `lead_form_submitted`, `offer_clicked`) emitted via the existing `track()` helper.
- **Synthetic_Check**: A Checkly browser script validating a real user journey on a schedule.
- **Docs_Site**: The Fumadocs Next.js app for `docs.theroyalglow.in`.
- **Health_Endpoint**: The Phase 9 `/api/health` route that BetterStack and Checkly probe.
- **Launch_Runbook**: `LAUNCH.md`, the condensed, code-aware launch procedure derived from `launch-checklist.md`.
- **Kill_Switch**: A feature flag that defaults ON for a core feature so its absence never disables the feature.

## Requirements

### Requirement 1: Error Monitoring (Sentry)

**User Story:** As a developer, I want server, client, and edge errors captured with context, so that I can diagnose production issues quickly.

#### Acceptance Criteria

1. WHEN an unexpected (non-`AppError`) error reaches the API error handler, THE handler SHALL report it to Sentry, AND SHALL NOT report expected `AppError`s as Sentry errors.
2. THE Sentry_Runtime SHALL initialise with the environment and release (`COMMIT_SHA`) and SHALL set `sendDefaultPii` to false.
3. WHEN Sentry is uninitialised, THE capture call SHALL be a no-op and SHALL NOT throw.
4. WHEN `NEXT_PUBLIC_SENTRY_DSN` is absent, THE Sentry_Runtime SHALL not initialise and the build SHALL still succeed.

### Requirement 2: Heatmaps & Session Replay (Microsoft Clarity)

**User Story:** As a product owner, I want heatmaps and session replay, so that I can see how customers use the site — but only with consent.

#### Acceptance Criteria

1. THE Clarity_Loader SHALL inject the Clarity script only when analytics consent is granted AND `NEXT_PUBLIC_CLARITY_ID` is configured.
2. THE Clarity_Loader SHALL inject the script at most once and SHALL be a no-op when consent is withheld or the id is absent.
3. WHEN no analytics keys are configured, THE Clarity_Loader SHALL not load and the build SHALL still succeed.

### Requirement 3: Feature Flags (PostHog)

**User Story:** As an operator, I want server-side feature flags with kill-switches, so that I can control feature exposure and disable a feature instantly.

#### Acceptance Criteria

1. THE Feature_Flags helper SHALL expose `isFeatureEnabled(flag, distinctId, defaultValue?)` and a typed `FLAGS` constant map of the launch kill-switch names.
2. WHEN PostHog is unconfigured or a flag evaluation fails, THE helper SHALL return the provided `defaultValue` (defaulting to false) and SHALL NOT throw.
3. WHEN a core Kill_Switch is queried, THE caller SHALL pass a default of true so that the absence of PostHog never disables a core feature.

### Requirement 4: Funnel Events

**User Story:** As a product owner, I want the booking and lead flows to emit analytics events, so that PostHog funnels show drop-off.

#### Acceptance Criteria

1. WHEN a customer opens the booking dialog, completes a step, or submits a booking request, THE flow SHALL emit the corresponding Funnel_Event (`booking_started`, `booking_step_completed`, `booking_request_submitted`); and lead-form submission SHALL emit `lead_form_submitted` and an offer click SHALL emit `offer_clicked`.
2. WHEN no analytics provider is loaded, THE Funnel_Event emission SHALL be a no-op and SHALL NOT throw into the flow.

### Requirement 5: Synthetic Monitoring & Health Coverage

**User Story:** As an operator, I want real-browser checks of critical journeys, so that I know the app actually works, not just that the server responds.

#### Acceptance Criteria

1. THE Health_Endpoint SHALL cover the dependencies (database, redis, r2) that BetterStack and Checkly probe, so a green health response reflects the monitored surface.
2. THE Synthetic_Check set SHALL contain the five checks from `observability.md` — homepage+services, booking-dialog slots, sign-in, admin dashboard, and api/health under 500ms — each with a schedule and a configurable target base URL.

### Requirement 6: Documentation Site

**User Story:** As an engineer, I want a documentation site, so that the project's architecture and API are discoverable at `docs.theroyalglow.in`.

#### Acceptance Criteria

1. THE Docs_Site SHALL be a Fumadocs Next.js app that builds independently and SHALL NOT be imported by `apps/web` or included in its `transpilePackages`.
2. THE Docs_Site SHALL ship an initial content tree (overview, architecture, and an API-reference placeholder) and a build that succeeds without affecting the web or cms build.

### Requirement 7: Launch Runbook & Guarded Build

**User Story:** As a solo developer, I want a condensed launch runbook and a build that runs without observability keys, so that launch is repeatable and development is unblocked.

#### Acceptance Criteria

1. THE Launch_Runbook SHALL be delivered as `LAUNCH.md`, derived from `launch-checklist.md`, distinguishing code deliverables from ops steps and cross-referencing the health endpoint, CI workflows, and canonical env names.
2. WHEN `bun run typecheck`, `bun run lint`, and `bun run build` run with no observability keys configured, THE monorepo SHALL pass.
