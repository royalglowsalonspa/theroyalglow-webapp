# Launch Runbook — Royal Glow Salon & Spa

A condensed, code-aware launch procedure derived from `launch-checklist.md`. Use
this on launch day; the full checklist has the exhaustive per-service steps.

## What's code vs what's ops

The codebase is complete through Phase 10. Everything below that is "code" is
done and in the repo; everything "ops" is a one-time provisioning action that
switches the delivered code on. Every external integration is a guarded
extension point — with no key configured it no-ops and logs, so the app builds
and runs without secrets.

| Area | Code (done, in repo) | Ops (provision to activate) |
| --- | --- | --- |
| CI/CD | `.github/workflows/*` (ci, integration, load-test, deploy-prod, weekly-backup, monthly-backup-test, replicate-prod-to-pprd) | GitHub repo secrets; branch protection rules |
| Health | `GET /api/health` (DB/Redis/R2 guarded checks) | BetterStack monitor pointed at it |
| Errors | Sentry runtime init + API capture (`sentry.*.config.ts`, `instrumentation.ts`) | Sentry project + `NEXT_PUBLIC_SENTRY_DSN` + CI `SENTRY_*` |
| Analytics | Consent-gated PostHog + Meta Pixel + Clarity (`Analytics.tsx`), funnel `track()` calls | PostHog/Clarity/Pixel keys; dashboards + funnels |
| Feature flags | `lib/flags.ts` (`isFeatureEnabled`, `FLAGS`) | PostHog flags created (all OFF initially) |
| Synthetic | Checkly scripts (`tests/synthetic/*.check.ts`) | Checkly account + `npx checkly deploy` |
| Docs | Fumadocs site (`docs/`) | `docs.theroyalglow.in` DNS + deploy |
| Backups | `weekly-backup.yml` (pg_dump → R2) | R2 buckets + `R2_*` + Neon URLs + heartbeat |
| Data | seed scripts | Run seed against the Neon `prod` branch |

## Timeline

### T-72h — External service onboarding (ops)
Provision and store keys (canonical names per `environment-variables.md`) in
GitHub Secrets + Cloudflare Workers (OpenNext) env:
- Google OAuth, Neon (4 branches), Resend + Brevo (domain verified), Ably,
  Upstash (Redis + QStash), Cloudflare R2 (`rgss-invoices`, `rgss-backups`),
  Sentry, BetterStack (10 monitors + heartbeats + status page), PostHog,
  Clarity, Meta Pixel, Google Cloud Run (PDF API), AiSensy.
- Start DNS propagation: `theroyalglow.in`, `www`, `admin`, `status`, `docs`.

### T-48h — Data + monitoring (ops + code)
- Seed production data against Neon `prod` (branches → categories → services →
  staff → membership tiers → loyalty). Verify counts; confirm 0 customers/bookings.
- Create the first admin user; confirm Google sign-in → admin dashboard.
- Verify Sentry captures a test error, PostHog receives events, Clarity records a
  session, BetterStack monitors are green, SSL is active.

### T-24h — Testing gates (code, run in CI)
- `bun run lint`, `bun run typecheck`, `bun run test:unit` green.
- Integration + Playwright E2E pass (PR to `test`/`pprd`).
- Lighthouse CI: performance ≥ 95; accessibility/SEO/best-practices = 100.
- k6 load test: p95 < 500ms, error rate < 1%.
- Security: Trivy + OWASP ZAP, zero high/critical.
- **Go/No-Go Gate 2.**

### T-2h — Launch day (ops)
- Final pprd smoke test (sign-in, browse services, test booking → invoice → PDF
  in R2 → no Sentry errors).
- Merge `pprd → prod` → `deploy-prod.yml` runs: build → Sentry source maps →
  Cloudflare Workers (OpenNext) deploy → DB migrate → health check + smoke → notify.
- Configure PostHog feature flags (core kill-switches ON; `whatsapp` staged).
- **Go/No-Go Gate 3.**

### T-0 — Go live
- DNS cutover if needed; status page → Operational.
- Within 5 min: `/`, `/api/health` (200 + green), `/admin`, OAuth login, no
  Sentry errors, BetterStack UP, Cloudflare serving.

### T+1h / T+24h — Post-launch
- Golden-path real booking with the owner (book → confirm email → admin →
  complete → invoice PDF).
- T+24h: reminder cron heartbeat healthy, analytics flowing, no error spikes,
  backup ran (if Sunday).

## Go / No-Go gates (summary)

1. **T-72h** — all keys stored, DNS propagating, email domains verified, Google
   OAuth approved, PDF API healthy.
2. **T-24h** — E2E 100%, Lighthouse perf ≥ 95 / a11y = 100, load p95 < 500ms +
   0 errors at 50 VUs, security clean, prod data seeded, admin can sign in.
3. **T-2h** — pprd smoke passing, no active incidents, no critical Sentry errors,
   rollback plan ready, owner + developer available.

## Rollback (from `deployment.md`)

| Scenario | Action | Time |
| --- | --- | --- |
| UI bug | PostHog feature flag OFF | < 10s |
| App 500s | Cloudflare rollback to previous deploy | < 30s |
| Bad migration (no data loss) | revert migration + redeploy | < 10m |
| Bad migration (data) | Neon PITR to pre-migration point | < 5m |
| Neon outage | emergency DB from R2 weekly backup | < 30m |

`deploy-prod.yml` auto-rolls back to the previous Cloudflare deployment if the
post-deploy health check fails.

## References

- `deployment.md` — full pipeline, health endpoint, backup, rollback.
- `git-workflow.md` — branch gate matrix (dev → test → pprd → prod).
- `environment-variables.md` — canonical env var names.
- `observability.md` — the five observability layers.
- `launch-checklist.md` — the exhaustive per-service checklist.
