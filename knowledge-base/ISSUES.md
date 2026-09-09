# Understanding and working with issues

This guide helps contributors and coding agents read, classify, and work on issues
in **royalglowsalonspa/theroyalglow-webapp**. It explains the repository's label
names, workflow, and technical vocabulary.

Use [GitHub Issues](https://github.com/royalglowsalonspa/theroyalglow-webapp/issues)
for current work, evidence, discussions, and status. Use the
[GitHub label directory](https://github.com/royalglowsalonspa/theroyalglow-webapp/labels)
for the live label definitions. GitHub stores labels independently of repository
files; editing this guide does not create or change labels on GitHub.

## Contents

- [Reading an issue](#reading-an-issue)
- [Understanding label names](#understanding-label-names)
- [Choosing labels](#choosing-labels)
- [Priority and severity](#priority-and-severity)
- [Finding relevant issues](#finding-relevant-issues)
- [Writing and progressing an issue](#writing-and-progressing-an-issue)
- [Automation labels](#automation-labels)
- [Label directory](#label-directory)
- [Technical glossary](#technical-glossary)
- [Maintaining this guide](#maintaining-this-guide)

## Reading an issue

Read the title and labels to identify the problem, affected component, and urgency.
Then read the body and latest discussion before implementing anything. Evidence
can describe an earlier revision or environment, so confirm that it still applies.

| Part | What to look for |
| --- | --- |
| Title | The observable problem or requested outcome. |
| Summary and impact | What happens, who is affected, and why the work matters. |
| Reproduction and evidence | Steps, expected versus actual behavior, environment, revision, logs, or screenshots. |
| Investigation | Confirmed findings distinguished from possible causes. |
| Proposed action | A suggested approach to evaluate against the evidence. |
| Acceptance criteria | Observable conditions that establish whether the work is complete. |
| Scope and dependencies | Boundaries, prerequisites, related issues, and linked pull requests. |
| Latest activity | Updated findings, decisions, ownership, and verification results. |

An open issue represents work or discussion that remains open in GitHub. A closed
issue may be resolved, duplicated, or intentionally declined; read its resolution
and linked changes. A merged pull request and a production deployment are separate
events. `agent-ready` describes the completeness of a handoff, not proof that every
hypothesis in the issue is correct or authorization for deployment.

## Understanding label names

A categorized label follows `category: slug`, with **one space after the colon**.
The slug is the short identifier after the colon, such as `online-booking` in
`feature: online-booking`. Copy the **entire label name**, including its category,
space, and capitalization, when filtering or applying it.

- Use lowercase words and hyphens for multiword slugs: `webhook: cms-revalidation`.
- Priority and severity retain uppercase codes: `priority: P2`, `severity: S3`.
- Standalone labels have no category prefix: `bug`, `dependencies`, `agent-ready`.
- `good first issue` and `help wanted` retain their established spaces.
- A label slug is a classification identifier; it does not have to match a route,
  package, or directory name. For example, `api: loyalty` covers the gems endpoints.

| Category | Question it answers | Example |
| --- | --- | --- |
| `type:` or a primary standalone label | What kind of work is this? | `type: docs`, `bug`, `dependencies` |
| `area:` | Which subsystem or engineering concern is affected? | `area: cms`, `area: security` |
| `feature:` | Which user or business capability is affected? | `feature: blog`, `feature: online-booking` |
| `api:` | Which endpoint family or external API contract is involved? | `api: bookings`, `api: resend` |
| `webhook:` | Which event-delivery integration is involved? | `webhook: slack`, `webhook: qstash` |
| `tech:` | Which framework, platform, or tool is involved? | `tech: mintlify`, `tech: nextjs` |
| `lang:` | Which language or configuration format is relevant? | `lang: typescript`, `lang: sql` |
| `priority:` | How soon should the work be addressed? | `priority: P1` |
| `severity:` | How serious is the defect's impact? | `severity: S2` |
| `status:` | What additional triage or dependency state matters? | `status: needs-info`, `status: blocked` |

`type: feature` means a request for new or enhanced behavior. `feature: blog`
identifies a capability and can also appear on a bug or documentation issue.
An area can cover several features, and a feature can cross several areas.
Existing domain labels such as `area: bookings` cover domain-wide engineering;
`feature: online-booking` identifies the particular customer flow.

`type: docs` identifies documentation work. `area: docs` identifies the
documentation site or tooling as the affected component. A documentation hosting
defect can therefore use `bug`, `area: docs`, and `tech: mintlify`.

## Choosing labels

1. Choose one primary kind: `bug`, `dependencies`, or a `type: ...` label.
2. Add one or two affected areas. Add more only when they help route the work.
3. Add a feature when the issue concerns a specific user or business capability.
4. Add API, webhook, technology, and language labels when those details help
   identify the work. An issue does not need every technology used by the app.
5. Assign one priority after triage. Assign one severity for a defect when its
   impact is understood. An untriaged issue may have neither yet.
6. Use status labels for meaningful triage states or blockers, and remove them
   when their conditions no longer apply.

These examples illustrate classification; they are not a list of current issues.

| Example problem | Useful labels |
| --- | --- |
| A shared button has an inaccessible focus style | `bug`, `area: ui`, `area: accessibility`, `tech: tailwind`, `lang: css` |
| Published blog content remains stale | `bug`, `area: cms`, `feature: blog`, `webhook: cms-revalidation` |
| A booking endpoint returns an incorrect result | `bug`, `area: api`, `feature: online-booking`, `api: bookings` |
| A scheduled sales report fails to reach Slack | `bug`, `area: reports`, `feature: sales-reports`, `webhook: slack` |
| Documentation navigation needs an update | `type: docs`, `area: docs`, `tech: mintlify` |
| A new waitlist capability is requested | `type: feature`, `feature: waitlist`, `area: bookings` |

For a Slack issue, add `api: slack` if the HTTP contract is relevant, or
`tech: slack` if platform configuration is relevant. For webhook issues, identify
the sender, receiver, payload, authentication, retries, and duplicate-delivery
behavior. "Incoming webhook" may be the provider's name for a URL that this
application calls outbound, as with Slack report delivery.

Labels can describe planned work. Their existence does not establish that a
feature is implemented, configured, or deployed. The directory marks documented
future integrations accordingly. `lang: java` is reserved for future Java work;
the repository currently has no Java source.

## Priority and severity

Priority describes scheduling urgency. Severity describes defect impact. Assess
them independently; a label should not silently change just because the other
dimension changes.

| Priority | Interpretation |
| --- | --- |
| `priority: P0` | Immediate attention; takes precedence over scheduled work. |
| `priority: P1` | High priority; address in the current work cycle. |
| `priority: P2` | Normal priority; schedule through the regular backlog. |
| `priority: P3` | Low priority; useful work without near-term urgency. |

| Severity | Interpretation |
| --- | --- |
| `severity: S1` | Critical: data loss, security exposure, or an unavailable core flow. |
| `severity: S2` | Major: functionality, protection, or reliability is materially degraded. |
| `severity: S3` | Minor: limited scope, cosmetic defect, or low operational impact. |

Feature requests, questions, and routine chores usually do not need a severity.
Document impact and the reason for an urgent priority in the issue body. These
codes express this repository's triage conventions, not a promised response time.

## Finding relevant issues

Use these queries in the repository's GitHub Issues search. Quote label names
because they contain spaces. Each query can also be prefixed with
`repo:royalglowsalonspa/theroyalglow-webapp` when searching across GitHub.

| Find | Search query |
| --- | --- |
| Open work in an area | `is:issue is:open label:"area: auth"` |
| Open work on a capability | `is:issue is:open label:"feature: blog"` |
| Booking API defects | `is:issue is:open label:bug label:"api: bookings"` |
| Slack webhook work | `is:issue is:open label:"webhook: slack"` |
| Immediate-priority work | `is:issue is:open label:"priority: P0"` |
| Work with a prepared handoff | `is:issue is:open label:agent-ready -label:"status: blocked"` |
| Newcomer-friendly work | `is:issue is:open label:"good first issue"` |
| Intentionally declined issues | `is:issue is:closed label:wontfix` |

Multiple label filters narrow the search to issues carrying all those labels.
The absence of a label is not evidence that an issue is unrelated; also search
titles and bodies and read linked tracking issues.

## Writing and progressing an issue

Write a concise title describing the problem or desired outcome, such as
`Booking confirmation email omits the appointment time`. Keep classification in
labels rather than prefixes such as `[S3]`, `[P2]`, `[Bug]`, `[Chore]`, or `[Tracker]`.
Use `type: chore` and `type: tracking` for the latter two kinds of work.

Provide the summary, impact, evidence, scope, and acceptance criteria described
above. Record an environment and revision when reporting a defect, and separate
observations from possible causes. Follow [SECURITY.md](../SECURITY.md) for private
vulnerability reporting. Keep credentials and customer personal data out of
public issue evidence.

During triage, confirm the scope, choose labels, and clarify missing information.
Use `status: needs-info` when waiting for evidence, `status: blocked` for an
identified prerequisite, and `status: upstream` when resolution depends on an
external project or service. Link the relevant prerequisite or upstream report.

Use `type: tracking` for a parent issue coordinating actionable child issues.
Link the implementation PR and record verification against the acceptance
criteria. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for branch, review, and merge
requirements. Record a reason when closing as `duplicate`, `invalid`, or `wontfix`;
link the canonical issue when marking a duplicate.

## Automation labels

The following exact names are referenced by [Dependabot](../.github/dependabot.yml)
or [Mergify](../.mergify.yml). Changes to their names require checking their
consumers. A classification label alone does not grant permission to merge.

| Label | Operational meaning |
| --- | --- |
| `dependencies` | Dependabot updates and Mergify dependency queue priority. |
| `github-actions` | Dependabot's GitHub Actions dependency classification. |
| `hotfix` | Highest configured Mergify queue priority for emergency fixes. |
| `security` | Elevated Mergify queue priority for security remediation. |
| `merge-ready` | Enables Mergify auto-queue and merge after the required review and checks. |
| `promotion` | Environment-promotion PR classification used by Mergify. |
| `release` | Release Please version and changelog PR classification used by Mergify. |
| `autorelease: ...` | Release tooling manages these lifecycle labels; preserve its exact names. |

`area: security` classifies a concern. `security` also affects merge queue priority.
`agent-ready` describes a prepared implementation handoff; it does not imply
`merge-ready` or approval to operate external systems.

## Label directory

The tables below retain the exact label names and their intended meanings. These
are reference definitions; use GitHub for the live label set and issue assignments.
Colors help scanning, while names and descriptions carry the meaning.

### Issue types

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `type: chore` | Routine maintenance, configuration, or repository housekeeping. | `#0075CA` |
| `type: design` | User experience, interaction design, or visual design work. | `#0075CA` |
| `type: docs` | Documentation, guides, examples, or reference material. | `#0075CA` |
| `type: feature` | New user-facing capability or enhancement to existing behavior. | `#A2EEEF` |
| `type: investigation` | Research or diagnosis needed before choosing an implementation. | `#0075CA` |
| `type: question` | A question requiring clarification or technical guidance. | `#0075CA` |
| `type: refactor` | Internal restructuring without an intended behavior change. | `#0075CA` |
| `type: test` | Test coverage, test infrastructure, or verification work. | `#0075CA` |
| `type: tracking` | Parent issue coordinating related issues or a larger initiative. | `#0075CA` |

### Areas

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `area: accessibility` | Keyboard access, screen readers, semantic markup, contrast, and inclusive UX. | `#1D76DB` |
| `area: admin` | Staff and management portal in apps/admin. | `#1D76DB` |
| `area: analytics` | Product analytics, business reporting, dashboards, and event tracking. | `#1D76DB` |
| `area: api` | HTTP routes, API contracts, request validation, and responses. | `#1D76DB` |
| `area: audit-logs` | Administrative audit records, activity history, and log access. | `#1D76DB` |
| `area: auth` | Sign-in, Google OAuth, sessions, account management, and Better Auth. | `#1D76DB` |
| `area: background-jobs` | Scheduled jobs, queues, retries, dispatch, and asynchronous processing. | `#1D76DB` |
| `area: billing` | Checkout, invoice business rules, GST, payment records, and totals. | `#1D76DB` |
| `area: blog` | Blog content, article pages, categories, publishing, and editorial presentation. | `#1D76DB` |
| `area: bookings` | Appointment creation, booking lifecycle, walk-ins, and cancellations. | `#1D76DB` |
| `area: branches` | Business locations, branch settings, and branch-scoped records. | `#1D76DB` |
| `area: cache` | Application caching, ISR, cache invalidation, and stale content. | `#1D76DB` |
| `area: ci` | GitHub Actions, automated checks, build pipelines, and workflow configuration. | `#1D76DB` |
| `area: cms` | Payload CMS, content collections, publishing, and CMS hooks. | `#1D76DB` |
| `area: configuration` | Environment variables, integration settings, and application configuration. | `#1D76DB` |
| `area: core` | Shared business rules, validation, types, and error handling. | `#1D76DB` |
| `area: crm` | Customer profiles, leads, enquiries, follow-ups, and customer notes. | `#1D76DB` |
| `area: database` | PostgreSQL schemas, queries, connections, indexes, and data integrity. | `#1D76DB` |
| `area: deployment` | App deployments, environment promotion, release delivery, and rollback. | `#1D76DB` |
| `area: dns` | Domains, DNS records, TLS certificates, and certificate authority policy. | `#1D76DB` |
| `area: docs` | Documentation site, knowledge base, contributor guides, and runbooks. | `#1D76DB` |
| `area: email` | Email templates, sender configuration, delivery, and subscription handling. | `#1D76DB` |
| `area: infra` | Cloud infrastructure, hosting, networking, and infrastructure configuration. | `#1D76DB` |
| `area: integrations` | External service APIs, webhooks, MCP connections, and third-party integrations. | `#1D76DB` |
| `area: invoicing` | Invoice rendering, PDF generation, and the apps/invoicing service. | `#1D76DB` |
| `area: loyalty` | Loyalty gems, earning, redemption catalogue, balances, and expiry. | `#1D76DB` |
| `area: marketing` | Campaigns, marketing email, acquisition attribution, and lead capture. | `#1D76DB` |
| `area: memberships` | Spa memberships, tiers, purchased hours, session usage, and expiry. | `#1D76DB` |
| `area: migrations` | Schema migrations, seed data, drift checks, and migration safety. | `#1D76DB` |
| `area: notifications` | Email, push notifications, reminders, and transactional messaging. | `#1D76DB` |
| `area: observability` | Logs, metrics, traces, error reporting, health checks, and alerts. | `#1D76DB` |
| `area: offers` | Promotions, discounts, combo pricing, eligibility, and offer expiry. | `#1D76DB` |
| `area: performance` | Latency, Core Web Vitals, rendering performance, and query efficiency. | `#1D76DB` |
| `area: permissions` | Role-based access control, authorization, and staff permissions. | `#1D76DB` |
| `area: privacy` | Consent, personal data handling, retention, and privacy controls. | `#1D76DB` |
| `area: pwa` | Web app manifest, installation, service workers, and offline behavior. | `#1D76DB` |
| `area: realtime` | Live booking updates, queue boards, and availability events. | `#1D76DB` |
| `area: reliability` | Availability, resilience, backups, restoration, and disaster recovery. | `#1D76DB` |
| `area: reports` | Sales reports, GST summaries, business dashboards, and scheduled report delivery. | `#1D76DB` |
| `area: scheduling` | Availability, time slots, staff schedules, leave, and calendar integration. | `#1D76DB` |
| `area: search` | Search, filtering, and result discovery across services, blog posts, and admin lists. | `#1D76DB` |
| `area: security` | Security hardening, abuse prevention, secrets, and vulnerability remediation. | `#1D76DB` |
| `area: seo` | Metadata, structured data, sitemaps, indexing, and search discoverability. | `#1D76DB` |
| `area: services` | Salon and spa service catalogue, categories, pricing, and durations. | `#1D76DB` |
| `area: staff` | Staff records, assignments, roles in business operations, and leave. | `#1D76DB` |
| `area: storage` | File uploads, media, object storage, invoice files, and image delivery. | `#1D76DB` |
| `area: testing` | Unit, integration, end-to-end, accessibility, and load testing. | `#1D76DB` |
| `area: tooling` | Local development, Bun workspaces, Turborepo, linting, and build tools. | `#1D76DB` |
| `area: ui` | Shared components, styling, themes, and the design system in packages/ui. | `#1D76DB` |
| `area: web` | Customer-facing website and application in apps/web. | `#1D76DB` |
| `area: webhooks` | Event callbacks, signature checks, retries, deduplication, and webhook delivery. | `#1D76DB` |

### Features

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `feature: blog` | Reading, finding, and publishing salon and spa articles. | `#0F766E` |
| `feature: calendar-sync` | Planned Google Calendar appointment integration and incremental consent. | `#0F766E` |
| `feature: cancellations` | Customer or staff cancellation of an appointment and related updates. | `#0F766E` |
| `feature: checkout` | Completing a service, calculating charges, and recording payment. | `#0F766E` |
| `feature: consent-management` | Privacy acknowledgement and optional analytics or marketing consent. | `#0F766E` |
| `feature: customer-notes` | Recording customer and lead notes, tags, and follow-up context. | `#0F766E` |
| `feature: customer-profiles` | Viewing and updating customer details, preferences, and visit history. | `#0F766E` |
| `feature: gallery` | Browsing and managing salon, spa, and service gallery images. | `#0F766E` |
| `feature: google-sign-in` | Customer and staff sign-in through Google OAuth. | `#0F766E` |
| `feature: invoice-pdf` | Generating, storing, downloading, and emailing invoice PDFs. | `#0F766E` |
| `feature: lead-capture` | Contact enquiries, campaign landing forms, and lead creation. | `#0F766E` |
| `feature: leave-management` | Staff leave requests, approval, and availability adjustments. | `#0F766E` |
| `feature: loyalty-gems` | Earning and redeeming loyalty gems and viewing balances and expiry. | `#0F766E` |
| `feature: marketing-attribution` | Campaign sources, conversion events, and customer acquisition attribution. | `#0F766E` |
| `feature: memberships` | Buying and managing spa memberships, remaining hours, sessions, and expiry. | `#0F766E` |
| `feature: newsletter` | Blog newsletter signup experience and subscription delivery integration. | `#0F766E` |
| `feature: offers` | Discovering and applying eligible offers, discounts, and service combos. | `#0F766E` |
| `feature: onboarding` | Collecting required customer details and consent after initial sign-in. | `#0F766E` |
| `feature: online-booking` | Customer appointment selection, booking dialog, submission, and confirmation. | `#0F766E` |
| `feature: push-notifications` | Push subscription, delivery, and appointment or membership alerts. | `#0F766E` |
| `feature: realtime-updates` | Live booking, queue, notification, and staff-availability updates. | `#0F766E` |
| `feature: rescheduling` | Moving an existing appointment to another available date or time. | `#0F766E` |
| `feature: sales-reports` | Daily, weekly, and monthly business reports delivered to staff and owners. | `#0F766E` |
| `feature: service-catalogue` | Browsing and managing services, categories, prices, and durations. | `#0F766E` |
| `feature: staff-scheduling` | Staff availability, service assignments, and daily appointment schedules. | `#0F766E` |
| `feature: waitlist` | Capturing waiting customers and managing the appointment waitlist. | `#0F766E` |
| `feature: whatsapp` | Planned AiSensy WhatsApp messaging and shared team inbox integration. | `#0F766E` |

### APIs

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `api: ably` | Ably token issuance, publishing, and realtime service API integration. | `#B45309` |
| `api: aisensy` | Planned AiSensy API integration for WhatsApp campaigns and messaging. | `#B45309` |
| `api: auth` | Internal Better Auth routes, session endpoints, and authentication API contracts. | `#B45309` |
| `api: availability` | Appointment slot and service availability endpoints. | `#B45309` |
| `api: billing` | Billing records, checkout operations, and invoice business data endpoints. | `#B45309` |
| `api: bookings` | Booking creation, retrieval, updates, completion, cancellation, and rescheduling endpoints. | `#B45309` |
| `api: brevo` | Brevo API integration work for marketing contacts and campaign email. | `#B45309` |
| `api: cloudflare-r2` | S3-compatible R2 API integration for file storage, retrieval, and health checks. | `#B45309` |
| `api: cms` | Payload CMS content APIs and their consumers in the website. | `#B45309` |
| `api: customers` | Customer profile, notes, tags, and customer management endpoints. | `#B45309` |
| `api: google-calendar` | Planned Google Calendar event API integration for appointments. | `#B45309` |
| `api: google-oauth` | Google OAuth authorization, callbacks, tokens, scopes, and consent integration. | `#B45309` |
| `api: health` | Health and dependency readiness endpoints and their response contracts. | `#B45309` |
| `api: integrations` | Integration status and configuration endpoint contracts. | `#B45309` |
| `api: invoicing` | HTTP contract between the apps and the Hono invoice rendering service. | `#B45309` |
| `api: jobs` | Scheduled and triggered job HTTP endpoints invoked by QStash. | `#B45309` |
| `api: leads` | Lead capture, lead management, and lead notes endpoints. | `#B45309` |
| `api: loyalty` | Gems balances, redemption, and loyalty catalogue endpoints. | `#B45309` |
| `api: memberships` | Membership purchase, tiers, cancellation, and session-recording endpoints. | `#B45309` |
| `api: meta` | Meta Graph and Conversions API integration for marketing and acquisition events. | `#B45309` |
| `api: notifications` | Notification feeds, read state, and push subscription endpoints. | `#B45309` |
| `api: qstash` | QStash publish, scheduling, signature verification, and job-delivery API integration. | `#B45309` |
| `api: reports` | Sales, billing, and business reporting endpoints. | `#B45309` |
| `api: resend` | External Resend API calls for transactional email and invoice delivery. | `#B45309` |
| `api: revalidation` | Authenticated content invalidation through the website revalidation endpoint. | `#B45309` |
| `api: scheduling` | Schedules, leave requests, and staff self-service availability endpoints. | `#B45309` |
| `api: services` | Service catalogue, service categories, and service management endpoints. | `#B45309` |
| `api: settings` | Application settings and branch configuration endpoints. | `#B45309` |
| `api: slack` | HTTP integration with Slack for business reports and operational notifications. | `#B45309` |
| `api: staff` | Staff directory, staff assignments, users, and staff service endpoints. | `#B45309` |
| `api: waitlist` | Waitlist creation, retrieval, and item management endpoints. | `#B45309` |

### Webhooks

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `webhook: aisensy` | Planned inbound AiSensy message/status callbacks and signature verification. | `#BE185D` |
| `webhook: betterstack` | Outbound Better Stack incident webhooks from deployment and backup workflows. | `#BE185D` |
| `webhook: cms-revalidation` | Payload change/delete callbacks that invalidate website content caches. | `#BE185D` |
| `webhook: meta-leads` | Planned inbound Meta lead-generation webhook, verification, and lead ingestion. | `#BE185D` |
| `webhook: qstash` | Signed QStash HTTP job delivery, retry handling, and idempotency. | `#BE185D` |
| `webhook: slack` | App-to-Slack incoming-webhook delivery of daily and weekly reports. | `#BE185D` |

### Technologies

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `tech: ably` | Ably channels, authentication, subscriptions, and realtime delivery. | `#5319E7` |
| `tech: aisensy` | Planned AiSensy WhatsApp platform and shared inbox integration. | `#5319E7` |
| `tech: aws` | AWS Lambda, CloudFront, IAM, CloudWatch, S3, and related infrastructure. | `#5319E7` |
| `tech: better-auth` | Better Auth SDK, plugins, sessions, and authentication adapters. | `#5319E7` |
| `tech: betterstack` | Better Stack uptime monitoring, heartbeats, alerts, and status pages. | `#5319E7` |
| `tech: biome` | Biome formatting, linting, rules, and configuration. | `#5319E7` |
| `tech: brevo` | Brevo marketing email, contact synchronization, and campaign integration. | `#5319E7` |
| `tech: bun` | Bun runtime, package installation, lockfile, and workspaces. | `#5319E7` |
| `tech: checkly` | Checkly synthetic browser and API monitoring checks. | `#5319E7` |
| `tech: clarity` | Microsoft Clarity browser analytics, session recording, and consent gating. | `#5319E7` |
| `tech: cloudflare` | Cloudflare DNS, R2 object storage, and Cloudflare service configuration. | `#5319E7` |
| `tech: docker` | Container images, Dockerfiles, build stages, and container runtime behavior. | `#5319E7` |
| `tech: drizzle` | Drizzle ORM queries, schema definitions, Kit, and generated migrations. | `#5319E7` |
| `tech: gcp` | Google Cloud Run and Google Cloud infrastructure for invoicing. | `#5319E7` |
| `tech: hono` | Hono HTTP server, middleware, routing, and invoicing API integration. | `#5319E7` |
| `tech: k6` | k6 load tests, traffic scenarios, thresholds, and performance results. | `#5319E7` |
| `tech: lexical` | Payload Lexical rich-text editing, content serialization, and rendering. | `#5319E7` |
| `tech: lighthouse` | Lighthouse audits and CI gates for performance, accessibility, and SEO. | `#5319E7` |
| `tech: meta` | Meta Pixel, Graph API, and Conversions API integration. | `#5319E7` |
| `tech: mintlify` | Mintlify documentation configuration, navigation, styling, publishing, and MCP integration. | `#5319E7` |
| `tech: neon` | Neon database hosting, branches, pooling, and serverless connections. | `#5319E7` |
| `tech: nextjs` | Next.js routing, rendering, caching, server actions, and framework behavior. | `#5319E7` |
| `tech: nodejs` | Node.js runtime, scripts, process behavior, and module compatibility. | `#5319E7` |
| `tech: payload` | Payload CMS framework, plugins, collections, and adapters. | `#5319E7` |
| `tech: playwright` | Playwright browser tests, fixtures, traces, and end-to-end test configuration. | `#5319E7` |
| `tech: postgres` | PostgreSQL behavior, SQL, constraints, indexes, and query planning. | `#5319E7` |
| `tech: posthog` | PostHog events, product analytics, consent gating, and SDK integration. | `#5319E7` |
| `tech: qstash` | Upstash QStash scheduling, publish clients, signed delivery, and retries. | `#5319E7` |
| `tech: react` | React components, hooks, state, hydration, and rendering. | `#5319E7` |
| `tech: react-pdf` | React PDF renderer, invoice layout, fonts, and PDF document generation. | `#5319E7` |
| `tech: redis` | Redis-backed distributed rate limits, cache integration, and connection behavior. | `#5319E7` |
| `tech: render` | Render hosting, service configuration, builds, and CMS deployment. | `#5319E7` |
| `tech: resend` | Resend transactional email, templates, sender setup, and delivery. | `#5319E7` |
| `tech: sentry` | Sentry error tracking, instrumentation, DSNs, and source maps. | `#5319E7` |
| `tech: slack` | Slack integration configuration, report formatting, and webhook delivery. | `#5319E7` |
| `tech: sst` | SST infrastructure definitions, deployment state, and application resources. | `#5319E7` |
| `tech: tailwind` | Tailwind CSS utilities, theme configuration, and styling compilation. | `#5319E7` |
| `tech: turborepo` | Turborepo task pipelines, caching, workspace orchestration, and binaries. | `#5319E7` |
| `tech: upstash` | Upstash Redis, rate limiting, QStash scheduling, and message delivery. | `#5319E7` |
| `tech: vitest` | Vitest unit and integration tests, mocking, coverage, and configuration. | `#5319E7` |
| `tech: zod` | Zod runtime schemas, input validation, and type inference. | `#5319E7` |

### Languages and formats

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `lang: css` | CSS stylesheets, tokens, selectors, and browser styling behavior. | `#006B75` |
| `lang: html` | HTML markup, standalone design references, and static documentation pages. | `#006B75` |
| `lang: java` | Reserved for future Java code or integrations; no Java source currently in this repo. | `#006B75` |
| `lang: javascript` | JavaScript source, ES modules, scripts, and runtime language behavior. | `#006B75` |
| `lang: powershell` | PowerShell scripts and Windows development or operations tooling. | `#006B75` |
| `lang: python` | Python scripts and repository tooling. | `#006B75` |
| `lang: shell` | Shell and Bash scripts for deployment, operations, and automation. | `#006B75` |
| `lang: sql` | SQL queries, schema definitions, migrations, and database scripts. | `#006B75` |
| `lang: typescript` | TypeScript and TSX source, type definitions, and compiler behavior. | `#006B75` |
| `lang: yaml` | YAML workflow, hosting, and automation configuration. | `#006B75` |

### Priority labels

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `priority: P0` | Fix immediately; takes precedence over scheduled work. | `#B60205` |
| `priority: P1` | High priority; address in the current work cycle. | `#D93F0B` |
| `priority: P2` | Normal priority; schedule through the regular backlog. | `#FBCA04` |
| `priority: P3` | Low priority; useful improvement without near-term urgency. | `#C2E0C6` |

### Severity labels

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `severity: S1` | Critical impact: data loss, security exposure, or a core flow is unavailable. | `#B60205` |
| `severity: S2` | Major impact: functionality, protection, or reliability is materially degraded. | `#D93F0B` |
| `severity: S3` | Minor impact: limited scope, cosmetic defect, or low operational impact. | `#FBCA04` |

### Triage status

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `status: blocked` | Cannot proceed until a linked dependency or external prerequisite is resolved. | `#FEF2C0` |
| `status: confirmed` | Issue reproduced or the requested work has been validated. | `#FEF2C0` |
| `status: needs-info` | Waiting for details, logs, or a reproducible example. | `#FEF2C0` |
| `status: needs-triage` | Needs initial review, classification, and prioritization. | `#FEF2C0` |
| `status: upstream` | Resolution depends on an upstream library or external service. | `#FEF2C0` |

### Standalone labels and workflow flags

| Exact label name | Meaning | Color |
| --- | --- | --- |
| `agent-ready` | Self-contained context, investigation, and acceptance criteria for implementation. | `#059669` |
| `breaking-change` | Changes a supported contract and requires migration or coordinated rollout. | `#D93F0B` |
| `bug` | Existing behavior is broken or produces an incorrect result. | `#D73A4A` |
| `dependencies` | Dependency updates and compatibility; also used by Dependabot and Mergify. | `#0366D6` |
| `duplicate` | Already tracked elsewhere; link the canonical issue before closing. | `#CFD3D7` |
| `github-actions` | GitHub Actions platform and action dependencies; used by Dependabot. | `#5319E7` |
| `good first issue` | Well-scoped work with enough guidance for a first-time contributor. | `#7057FF` |
| `help wanted` | Contributions or additional expertise are welcome. | `#008672` |
| `hotfix` | Emergency production fix; grants highest Mergify queue priority. | `#B60205` |
| `invalid` | Not an actionable issue for this repository after review. | `#D97706` |
| `merge-ready` | Approved for Mergify auto-queue and merge; apply only after review. | `#0E8A16` |
| `promotion` | Environment promotion pull request; used by Mergify. | `#1D76DB` |
| `regression` | Previously working behavior broke after a change. | `#D73A4A` |
| `release` | Release Please version and changelog pull request; used by Mergify. | `#5319E7` |
| `security` | Security remediation; grants elevated Mergify queue priority. | `#D93F0B` |
| `wontfix` | Reviewed and intentionally declined; record the reason before closing. | `#9D174D` |

## Technical glossary

These definitions explain vocabulary that can appear in any issue. Configuration,
versions, limits, resource names, and deployment health belong in their source
files or the issue's dated evidence. The glossary makes no assertion that a
particular defect is still present.

### Repository and application structure

| Term | Meaning in this project |
| --- | --- |
| RGSS | Royal Glow Salon & Spa, the business served by this repository. |
| Monorepo / workspace | Related apps and shared packages maintained together. A workspace has its own package manifest and dependencies. |
| `apps/web` | Customer-facing website, booking experience, account pages, and public API routes. |
| `apps/admin` | Staff and management portal, operational APIs, and background-job handlers. |
| `apps/cms` / Payload CMS | Content management application, collections, hooks, and content APIs. |
| `apps/invoicing` / Hono | Separate HTTP service for invoice rendering, using the Hono framework. |
| `packages/business` / core | Shared business rules; other shared packages provide types, validation, errors, logging, database access, and UI components. |
| Next.js / React | The application framework and UI component library used by the web apps. |
| Tailwind / design tokens | Utility styling and named design values such as colors, spacing, and typography. |
| Mintlify | Documentation platform configured in `docs/docs.json`; documentation navigation and styling issues use `tech: mintlify`. |
| Fumadocs | Documentation framework mentioned in historical plans and discussions. Check the current docs configuration before treating an old reference as the active platform. |
| MCP | Model Context Protocol; the interface used by connected tools to expose capabilities to coding agents. |
| Slug | A short identifier, often using lowercase words and hyphens. Label slugs, article slugs, and route names serve different purposes. |

### Infrastructure and cloud

| Term | Meaning |
| --- | --- |
| AWS Lambda / execution environment | Request-driven compute using reusable runtime environments. Process-local state is not a shared or durable store across instances. |
| Cold start | Initialization work before an invocation can run when a suitable warm runtime is unavailable. |
| CloudFront / CDN | Content delivery network in front of app origins, with edge caching and request forwarding. |
| Origin / origin bypass | The service behind a proxy or CDN; origin bypass reaches that service without following the intended front-door path. |
| SST / infrastructure as code | Framework used to declare cloud resources in `sst.config.ts`; consult that file for the deployed resource model. |
| `sst.aws.Nextjs` | SST component for deploying a Next.js application and its supporting infrastructure. |
| `sst.aws.StaticSite` | SST component for serving a static site without application server rendering. |
| OpenNext | Adapter that packages Next.js output for the deployment platform used by SST. |
| `sst.Secret` / SSM Parameter Store | Infrastructure secret configuration and an AWS parameter-storage service. Check the installed SST version and deployment configuration for how values are stored and supplied. |
| `passthrough(...)` | Repository deployment helper for passing configured values into application environments; inspect its implementation when diagnosing omitted variables. |
| SST nodes | Underlying resources exposed by an SST component for lower-level customization. |
| ARM64 / x86 | CPU architectures that affect binary compatibility and runtime deployment choices. |
| SSR | Server-side rendering: generating page output on the server. |
| ISR / revalidation | Incremental Static Regeneration: cached page output is refreshed according to time or invalidation rules. |
| TTL | Time to live: the interval governing expiry of a cache entry or other time-limited value. |
| ISR tag cache / DynamoDB | Cache-tag bookkeeping can use DynamoDB in an OpenNext deployment. DynamoDB is distinct from the application's PostgreSQL database. |
| ISR revalidation queue / SQS | A queue for regeneration work. Delayed processing can leave stale output; check queue age, consumers, and cache behavior. |
| `ApproximateAgeOfOldestMessage` | SQS metric describing the age of the oldest eligible unprocessed message. Useful when investigating delayed queue processing. |
| Image optimizer | The component serving transformed images requested through Next.js image optimization. |
| Execution timeout / response-size limit | Platform constraints on invocation duration and returned payload size. Check the current runtime and invocation mode rather than relying on an old issue's numbers. |
| S3 / Cloudflare R2 | Separate object-storage services. R2 exposes an S3-compatible API; compatibility does not make the providers or buckets interchangeable. |
| IAM / least privilege | AWS identity and access controls; least privilege grants only the actions and resources required for a task. |
| AWS root user / `AdministratorAccess` | Account root identity and a broad managed IAM policy respectively; these are different concepts with different controls. |
| GitHub OIDC | OpenID Connect federation allowing a workflow to obtain short-lived cloud credentials under a configured trust relationship. |
| CloudTrail | AWS audit events used to investigate service activity and callers. |
| OAC / OAI | Origin Access Control and Origin Access Identity: mechanisms for controlling access from CloudFront to supported origins. |
| SNS / SQS | Simple Notification Service distributes notifications; Simple Queue Service buffers messages for processing. App jobs here use QStash, a separate service. |
| AWS Budgets / Free Tier alerts | Spend-related and allowance-related notifications. The existence of one does not demonstrate that the other is configured. |
| Well-Architected Framework | AWS architecture-review framework; an issue may refer to its security, reliability, or operational considerations. |
| `ap-southeast-1` / region review | Singapore AWS region; a region review evaluates measured app-to-user and app-to-database latency alongside operational constraints. |
| Read replica | Database copy intended for reads, with replication and consistency considerations. |
| Neon / database branch | Managed PostgreSQL platform and an isolated branch of database state. A branch and an independently verified backup serve different purposes. |
| Upstash Redis | Redis service accessed by the app for shared state such as distributed rate-limit counters. |
| QStash | Upstash HTTP scheduling and delivery service used to invoke background-job endpoints. |
| Cloud Run / Render | Hosting platforms referenced by the invoicing and CMS deployment configuration. Their label names do not establish deployment health. |
| DNS / Route 53 | Domain Name System and AWS's DNS service. Consult the project's DNS configuration for the authoritative provider. |
| TLS / ACM | Transport Layer Security and AWS Certificate Manager, which manages certificates for supported integrations. |
| CAA | Certification Authority Authorization: DNS policy governing which certificate authorities may issue certificates for a name. |
| ACME | Automatic Certificate Management Environment: protocol for automating certificate issuance and renewal. |
| CNAME / TXT | DNS record types used for aliases and text data such as verification records. |

### Authentication, permissions, and API security

| Term | Meaning |
| --- | --- |
| Better Auth | Authentication library and plugins used by the applications. |
| `secondaryStorage` | Better Auth integration point for external key-value storage; inspect the current configuration to see which data uses it. |
| Rate limiting / sliding window | Restricting request counts over a time interval; a sliding window considers a rolling interval. |
| Bucket / rate-limit key | Identifier against which requests are counted. Multiple callers sharing a key share its request allowance. |
| `429` / `Retry-After` | HTTP rate-limit response and a header indicating when a caller may retry. |
| `getClientIp()` / `X-Forwarded-For` | Client-address resolution and a forwarded-address header. Correct interpretation depends on which proxies and headers the application trusts. |
| OAuth / Google OAuth | Authorization flow used in the Google sign-in integration, including authorization requests, callbacks, and tokens. |
| Redirect URI / JavaScript origin | Callback destination versus browser origin. These are separate settings in provider configuration. |
| `redirect_uri_mismatch` | Provider error indicating that a requested callback URL does not match the registered configuration. |
| Google One Tap / GSI | Google Identity Services browser sign-in experience, with configuration distinct from a server redirect flow. |
| `BETTER_AUTH_URL` | Configured auth base URL used when constructing auth-related URLs. |
| Session cookie / domain scope | Browser credential and the domain rules controlling where it is sent. Check cookie settings when diagnosing cross-subdomain sign-in. |
| RBAC | Role-Based Access Control. Project roles include Customer, Staff, Receptionist, Manager, Owner, and Developer; consult the permissions model for allowed operations. |
| MFA | Multi-Factor Authentication: identity verification using more than one category of factor. |
| HMAC | Hash-based Message Authentication Code: checks message integrity and authenticity using a shared secret. Used in signed service requests. |
| Signature verification / replay protection | Checking a message's authenticity and preventing previously valid requests from being improperly reused. These are separate checks. |
| `getAuthTables()` / schema contract | Auth schema metadata and tests that compare expected auth fields with the database adapter's schema. |
| PII / consent / DPDP | Personally identifiable information, a user's permission choices, and India's Digital Personal Data Protection legislation. Use the privacy requirements for implementation decisions. |

### Database, migrations, and configuration

| Term | Meaning |
| --- | --- |
| Drizzle ORM | TypeScript schema and query tooling used in the database package. |
| Generate / migrate / push | Generate writes migration files; migrate applies migration history; push changes a database directly. Follow the repository's migration runbook for shared databases. |
| Migration drift / schema fingerprint | A mismatch between expected and actual schema; a normalized representation or hash supports comparison. |
| Pooled `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Application connection through a pooler versus a direct connection. Migration and session-dependent tooling must use the connection required by its runbook. |
| PgBouncer / transaction pooling | Connection pooling that can assign different backend sessions between transactions. Session-dependent behavior requires care. |
| Advisory lock | Application-managed PostgreSQL lock. Session-scoped and transaction-scoped forms have different lifetimes and pooling implications. |
| `pg_dump` / restore verification | Logical database backup tool and a separate check that the produced backup can restore the expected data. File existence alone is insufficient evidence. |
| `pipefail` | Shell behavior making a pipeline report a failed stage instead of relying only on the final command's exit status. |
| Forward-only migrations / expand-contract | Preserve migration history and evolve schemas in compatible stages: add a shape, migrate usage, then remove the old shape. |
| Neon control-plane API / `neon-admin.ts` | Management API and repository tooling for database branch operations, separate from SQL data access. |
| `NEON_API_KEY` | Credential for Neon management operations; distinct from a database connection string. |
| `env.ts` / Zod | Application environment declarations and runtime schema validation. A syntactically valid value does not prove a dependency works. |
| `safeParse()` | Zod validation returning a success/error result for callers to handle. |
| `emptyStringAsUndefined` | Environment-validation option treating an empty string as a missing value. |
| `NEXT_PUBLIC_*` | Next.js convention for values exposed in browser bundles; build-time substitution matters when changing configuration. |
| Optional dynamic import / no-op | Loading a dependency conditionally, and an operation that deliberately does nothing. Verify that intended optional behavior is distinguished from configuration failure. |
| Repository secret / variable | GitHub stores for sensitive credentials and non-sensitive configuration. Secret storage and masking do not make it safe to print credentials. |
| Environment-scoped configuration | Secrets or variables associated with a named deployment environment rather than every repository workflow. |
| `packageManager` pin | Manifest declaration of the expected package manager and version. Read the current `package.json` for its value. |

### Business and customer vocabulary

| Term | Meaning in this project |
| --- | --- |
| Salon / spa / SPA | Service lines of the business. In business discussions, SPA refers to spa services; in frontend discussions, SPA can mean single-page application. |
| Booking lifecycle | Allowed transitions from a booking request through approval, service delivery, and completion, with cancellation and other outcomes defined in the business rules. |
| Walk-in / waitlist | Staff-created booking for a present customer versus a record of someone waiting for availability. |
| Service catalogue | Service categories, descriptions, prices, and durations used by booking and billing. |
| Membership / session | Hours-based spa entitlement and an individual use recorded against it. |
| Gems | Loyalty rewards with earning, redemption, and expiry rules. Consult the business rules for eligibility and calculations. |
| CRM / lead | Customer Relationship Management and a prospective customer's enquiry or acquisition record. |
| GST / SAC | Goods and Services Tax and Services Accounting Code, used in billing. Verify configured tax rules rather than inferring them from a historical issue. |
| Paise / integer money | One rupee equals 100 paise. The application represents monetary values as integer paise to avoid floating-point calculation drift. |
| Indian digit grouping | Formatting such as `1,00,000`, used when displaying monetary values. |
| FY | Financial year; the Indian accounting convention runs April through March. The business numbering rules define its representation. |
| Booking / invoice number | Business-facing identifiers distinct from database IDs. Check the current generators and business specification for their format. |
| Invoice PDF / React PDF | Rendered invoice document produced by the invoicing service with React PDF components. |
| Blog / Lexical | Editorial articles and the rich-text format/editor used by Payload; publishing, rendering, and cache invalidation can affect the same article. |

### Observability, APIs, and messaging

| Term | Meaning |
| --- | --- |
| Sentry / DSN | Error reporting and the Data Source Name identifying its destination project. Configured SDKs still require delivery verification. |
| Source maps | Mapping from bundled code back to original source locations for readable error reports. |
| Better Stack monitor / heartbeat | A monitor polls a target; a heartbeat expects a successful job to check in within a configured interval. |
| Incident webhook | HTTP integration used to report incidents to a notification system. Identify the sender and receiver when describing it. |
| Health endpoint / pass, fail, skip | Dependency status reporting. Read the route's contract: skip may indicate intentional absence, while fail indicates an unsuccessful configured check. |
| CloudWatch logs / metrics / alarms | Event records, measurements, and conditions that trigger actions. Having logs does not establish that alerting is configured. |
| Synthetic check / test metric | A simulated request or controlled measurement used to verify behavior or an alert path. |
| TTFB / LCP | Time to First Byte and Largest Contentful Paint: server-response and page-rendering performance measures. |
| p50 / p75 / p95 | Percentiles of a measurement distribution; p95 is the value at or below which approximately 95% of samples fall. |
| PostHog / Clarity | Product analytics and browser experience tooling, subject to the application's consent handling. |
| REST / GraphQL / SDK | Resource-oriented HTTP API style, query-based API language, and Software Development Kit used to call a service. |
| Webhook / callback | HTTP delivery triggered by an event rather than by a user's immediate page request. |
| Idempotency / retry | Processing repeated delivery without duplicating the business effect, and attempting failed work again. |
| Resend / Brevo | Transactional email integration and marketing email/contact integration respectively. |
| Web Push / `web-push` | Browser push-delivery protocol and a Node.js library that implements sending. |
| VAPID | Voluntary Application Server Identification: key-based identification used with Web Push. |
| Push subscription pruning | Removing expired or invalid subscriptions when the push provider's response establishes that they are no longer usable. |
| Meta Pixel / CAPI | Browser conversion tracking and server-side Conversions API delivery. |
| Slack incoming webhook | Provider URL the app calls to deliver a channel message. Treat its URL as a credential. |
| AiSensy | WhatsApp integration platform referenced in the messaging plans. |
| Ably | Realtime channels, token authentication, and event delivery for live application updates. |
| QStash delivery / CMS revalidation | Signed job callbacks versus CMS-triggered content invalidation requests. Both need their own authentication and failure handling. |

### Delivery and tooling

| Term | Meaning |
| --- | --- |
| CI/CD / GitHub Actions | Continuous integration and delivery workflows for checks, builds, deployments, and operational jobs. |
| Turborepo (`turbo`) / Turbopack | Monorepo task orchestration versus Next.js bundling. An error from a task's bundler can appear inside Turborepo output. |
| Bun / `bun.lock` | Runtime/package tooling and the lockfile recording resolved dependencies. |
| Frozen lockfile | Installation mode that rejects a manifest/lockfile mismatch instead of updating the lockfile. |
| Workspace filter | Command option selecting a particular workspace or set of tasks; use the syntax appropriate to Bun or Turborepo. |
| Exit code | Process result interpreted in the context of the program and logs; a numeric code alone does not establish the root cause. |
| `bun audit` / dependency audit | Checking dependencies for reported vulnerabilities; record the revision, tool output, and time when using results as evidence. |
| Biome / Vitest / Playwright | Formatting and linting, unit/integration testing, and browser testing tools. |
| Lighthouse / k6 / OWASP ZAP | Web-quality audits, load testing, and web-application security scanning. |
| Checkly | Synthetic browser and API monitoring based on defined checks. |
| Dependabot / Mergify / Release Please | Dependency-update automation, merge queue automation, and release/version automation. |
| Promotion / rollback / cutover | Moving a revision between environments, returning to a previous revision or configuration, and switching traffic or responsibility to a replacement system. |
| `dev`, `test`, `pprd`, `prod` | Repository branch/environment vocabulary; `pprd` means pre-production. Follow the contributing and deployment guides for the workflow. |
| `gh` | GitHub command-line client for issues, PRs, labels, and repository operations. |

### Distinctions to check while investigating

- **Configured and functional:** a variable can pass validation while its service
  is unreachable or the wrong connection is selected. Verify the operation.
- **Build time and runtime:** values included in browser assets must be available
  when those assets are built; runtime-only changes may not update them.
- **Optional and broken:** a deliberately disabled capability and a failed
  configured capability need different outcomes and diagnostic signals.
- **Local and distributed state:** process memory is shared only within that
  process; scaling or restarting can change behavior.
- **Backup created and restore verified:** successful upload proves delivery of
  bytes, while restoration checks whether those bytes contain usable data.
- **Severity and priority:** impact and work order are separate decisions.

For deeper context, see the [knowledge-base index](./INDEX.md),
[authentication guide](./authentication.md),
[database schema](./database-schema.md),
[background jobs](./background-jobs.md), and
[environment reference](./environment-variables.md).

## Maintaining this guide

Keep this document useful across releases and changes to the issue backlog.

1. Document new label families, exact names, descriptions, and automation effects
   when the repository's label conventions change.
2. Add reusable terminology with a stable definition and a link to the relevant
   project reference when helpful.
3. Keep issue inventories, issue numbers, current defect status, deployment-health
   claims, one-off measurements, and version snapshots in GitHub or their specific
   operational documents. Do not add an open-issues summary table here.
4. Keep examples illustrative and independent of whether a particular issue is
   open or closed. Mark planned integrations clearly.
5. Update GitHub labels through GitHub itself when needed, then update this guide.
   This Markdown file is documentation, not a label synchronization mechanism.
