# Requirements Document

## Introduction

Migration of all admin-facing pages and API routes from the existing `apps/web` Next.js application into a dedicated `apps/admin` Next.js application, served at `admin.theroyalglow.in`. This architectural change separates the admin portal from the customer-facing website for improved security, independent deployment, and clearer separation of concerns. The monorepo shared packages (`db`, `business`, `types`, `errors`, `logger`) remain shared via Turborepo workspace references.

This migration is part of a broader subdomain architecture:

- `theroyalglow.in` — customer-facing website (`apps/web`)
- `admin.theroyalglow.in` — NEW admin portal (`apps/admin`)
- `cms.theroyalglow.in` — Payload CMS (`apps/cms`)
- `docs.theroyalglow.in` — documentation (`docs/`)
- `r2.theroyalglow.in` — Cloudflare R2 storage

## Glossary

- **Admin_App**: The new Next.js application at `apps/admin/` serving `admin.theroyalglow.in`
- **Web_App**: The existing Next.js application at `apps/web/` serving `theroyalglow.in`
- **CMS_App**: The Payload CMS application at `apps/cms/` serving `cms.theroyalglow.in`
- **Subdomain_Router**: DNS and Cloudflare routing configuration that directs requests to the correct application based on subdomain
- **Shared_Packages**: Monorepo packages consumed by both applications (`@repo/db`, `@repo/business`, `@repo/types`, `@repo/errors`, `@repo/logger`)
- **Admin_Middleware**: Edge middleware in Admin_App that validates sessions and enforces RBAC role hierarchy
- **Session_Cookie**: The `better-auth.session_token` HttpOnly cookie used for authentication
- **RBAC**: Role-Based Access Control with 6 roles and numeric levels: Customer (0) < Staff (1) < Receptionist (2) < Manager (3) < Owner (4) < Developer (5)
- **Turborepo_Pipeline**: The `turbo.json` task configuration that orchestrates builds across workspace apps and packages
- **Root-Path Convention**: Admin routes drop the `/admin` prefix because the subdomain itself provides the admin namespace (e.g., `admin.theroyalglow.in/bookings`, not `/admin/bookings`)

## Requirements

### Requirement 1: Separate Next.js Application Scaffold

**User Story:** As a developer, I want the admin portal to be a standalone Next.js application in `apps/admin/`, so that it can be developed, built, and deployed independently from the customer-facing website.

#### Acceptance Criteria

1. THE Admin_App SHALL exist at `apps/admin/` as a Next.js 16 application with App Router, containing an `app/` directory with a root layout and at least one page route, such that `next build` completes with exit code 0
2. THE Admin_App SHALL use the same runtime and tooling as Web_App: Bun, TypeScript strict mode (`"strict": true` in tsconfig), Biome for linting and formatting, Tailwind CSS v4, and shadcn/ui components
3. THE Admin_App SHALL declare workspace dependencies on Shared_Packages (`@repo/db`, `@repo/business`, `@repo/types`, `@repo/errors`, `@repo/logger`) in its `package.json` using the `workspace:*` protocol
4. THE Admin_App SHALL have its own `package.json`, `next.config.ts`, `tsconfig.json`, and `env.ts` that validates all required environment variables at build time using `@t3-oss/env-nextjs` with Zod schemas
5. THE Turborepo_Pipeline SHALL include Admin_App in `build`, `dev`, `lint`, `typecheck`, and `test` tasks without requiring changes to `turbo.json` task definitions
6. THE Admin_App SHALL run its dev server on port 3001 to avoid conflicts with Web_App (port 3000) and CMS_App (port 3002)
7. IF any declared workspace dependency in Shared_Packages fails to resolve during installation, THEN THE Admin_App SHALL fail the build with a dependency resolution error before compilation begins

### Requirement 2: Admin Route Migration

**User Story:** As a developer, I want all admin pages currently under `apps/web/src/app/admin/` to be migrated to `apps/admin/src/app/`, so that the customer-facing app no longer contains admin code.

#### Acceptance Criteria

1. THE Admin_App SHALL serve all existing admin routes at root paths per the Root-Path Convention: `/` (dashboard), `/bookings`, `/customers`, `/leads`, `/billing`, `/services`, `/offers`, `/staff`, `/schedule`, `/reports`, `/settings`, `/branches`, `/users`, `/integrations`, `/logs`, `/leave`, `/memberships`, `/waitlist`
2. WHEN the Admin_App build succeeds and all admin routes return HTTP 200 for authenticated requests, THE Web_App SHALL contain zero files and zero route segments under `apps/web/src/app/admin/`
3. THE Admin_App SHALL render the same layout structure as the existing admin shell: a persistent sidebar navigation on viewports 1024px and above, an overlay sidebar triggered by a hamburger button on viewports below 1024px, a top bar with notification bell and user avatar, and role-based menu item visibility matching the role-to-route mapping defined in the features specification
4. THE Admin_App SHALL retain all existing admin component files (tables, forms, grids, dialogs) such that each migrated page renders identically to its pre-migration counterpart when given the same data and user role
5. THE Admin_App SHALL import shared workspace packages (`@repo/db`, `@repo/types`, `@repo/business`, `@repo/errors`, `@repo/logger`) and build successfully with `turbo build --filter=@repo/admin` producing zero type errors
6. WHEN the Admin_App requires admin API endpoints, THE Admin_App SHALL access them via the API route handlers relocated to `apps/admin/src/app/api/`, such that all admin data operations (CRUD on bookings, customers, leads, invoices, memberships) remain functional
7. IF the `apps/web/` directory contains any residual admin-only components, layout files, or API routes after migration, THEN THE Web_App build or a CI check SHALL fail, asserting zero admin artifacts exist outside `apps/admin/`

### Requirement 3: Admin API Route Migration

**User Story:** As a developer, I want admin-specific API routes to be served from the Admin_App, so that the admin API surface is isolated from customer-facing API routes.

#### Acceptance Criteria

1. THE Admin_App SHALL host all admin API routes currently under `apps/web/src/app/api/admin/` at `apps/admin/src/app/api/`
2. THE Admin_App SHALL preserve the existing API route structure: `/api/bookings`, `/api/customers`, `/api/leads`, `/api/leave`, `/api/membership-tiers`, `/api/memberships`, `/api/offers`, `/api/schedule`, `/api/staff`, `/api/tags`
3. THE Admin_App SHALL preserve each route's existing HTTP methods (GET, POST, PATCH, DELETE) and request/response contract: `{ success: true, data: T }` for success and `{ success: false, error: { code, message, statusCode, requestId } }` for errors
4. WHEN an API capability is shared by both applications (authentication, Ably token issuance), THE Admin_App SHALL host its own local copy of that route configured against the same backing services, rather than calling the Web_App cross-origin from the browser
5. WHEN the Admin_App must call a Web_App-only endpoint, THE Admin_App SHALL perform the call server-side and SHALL handle non-2xx responses by returning a `502 UPSTREAM_ERROR` to its own caller without leaking upstream details
6. WHEN the admin API routes are removed from `apps/web/src/app/api/admin/`, THE Web_App SHALL return HTTP 404 for those old paths (no orphaned handlers remain)

### Requirement 4: Authentication and Session Sharing

**User Story:** As an admin user, I want to authenticate once and access both the customer site and admin portal without re-authenticating, so that my workflow is not interrupted by the subdomain split.

#### Acceptance Criteria

1. THE Session_Cookie SHALL be set with `domain=.theroyalglow.in`, `SameSite=Lax`, `Secure=true`, and `HttpOnly=true` attributes to enable sharing across subdomains while preventing cross-site and script-based access
2. THE Admin_App SHALL include its own auth API route (`/api/auth/[...betterauth]`) configured against the same Neon database, using the same `BETTER_AUTH_SECRET` as the Web_App to ensure both applications can validate the same session tokens
3. THE Admin_Middleware SHALL validate session presence by reading the `better-auth.session_token` cookie and verifying it against the session table via the local session endpoint, and SHALL enforce a minimum role of Receptionist (level 2) for all Admin_App routes
4. WHEN the session cookie is absent, THE Admin_Middleware SHALL redirect the user to `https://theroyalglow.in` (the Web_App domain where sign-in lives) with an HTTP 302 response
5. IF the session cookie is present but the session is invalid or expired (the session lookup returns a non-2xx response), THEN THE Admin_Middleware SHALL clear the invalid session cookie and redirect the user to `https://theroyalglow.in` with an HTTP 302 response
6. IF the session is valid but the user's role level is below Receptionist (level < 2), THEN THE Admin_Middleware SHALL return an HTTP 403 response without redirecting
7. THE Admin_App SHALL NOT serve its own sign-in page; authentication is handled exclusively on the Web_App domain
8. THE Web_App auth configuration SHALL set the session cookie domain to `.theroyalglow.in` so that session cookies issued during sign-in are readable by the Admin_App subdomain

### Requirement 5: RBAC Enforcement in Admin App

**User Story:** As a business owner, I want role-based access control enforced in the admin app identically to how it works today, so that staff members only see routes appropriate to their role level.

#### Acceptance Criteria

1. THE Admin_Middleware SHALL enforce the role hierarchy with numeric levels: Developer (5) > Owner (4) > Manager (3) > Receptionist (2) > Staff (1) > Customer (0), where a higher level grants access to all routes accessible by lower levels
2. IF a user's role level is below the minimum required for the requested admin route, THEN THE Admin_Middleware SHALL return an HTTP 403 response and SHALL NOT render the route content
3. THE Admin_App SHALL enforce route-level role minimums (root-path convention): Receptionist (level 2) for `/`, `/bookings`, `/waitlist`, `/customers`, `/leads`, `/billing`, `/leave`, `/memberships`; Manager (level 3) for `/services`, `/offers`, `/staff`, `/schedule`, `/reports`, `/settings`; Owner (level 4) for `/branches`, `/users`; Developer (level 5) for `/integrations`, `/logs`
4. THE Admin_App sidebar navigation SHALL render only menu items whose minimum role level is less than or equal to the current user's role level, and SHALL hide entire navigation sections when no items within that section are accessible
5. IF a user accesses an admin route without a valid authenticated session, THEN THE Admin_Middleware SHALL redirect the user to `https://theroyalglow.in` without returning a 403 response
6. IF the session validation request fails due to a network or server error during an admin route access, THEN THE Admin_Middleware SHALL redirect the user to `https://theroyalglow.in` rather than granting access to the requested route
7. IF the user's role is absent or not recognized in the defined hierarchy, THEN THE Admin_Middleware SHALL treat the user as having the lowest level (0) for access control decisions

### Requirement 6: DNS and Deployment Configuration

**User Story:** As a developer, I want `admin.theroyalglow.in` routed to the Admin_App via Cloudflare, so that the admin portal is reachable at its own subdomain with independent deployment.

#### Acceptance Criteria

1. THE Subdomain_Router SHALL route `admin.theroyalglow.in` traffic to the Admin_App Cloudflare Pages project via a proxied CNAME DNS record pointing to the `rgss-admin.pages.dev` deployment
2. THE Admin_App SHALL be deployed as a separate Cloudflare Pages project (project name: `rgss-admin`)
3. WHEN a push to the `prod` branch includes changes under `apps/admin/` or `packages/`, THE Admin_App deployment workflow (`deploy-admin-prod.yml`) SHALL trigger a build and deploy of the Admin_App to the `rgss-admin` Cloudflare Pages project
4. WHEN the Admin_App deployment completes, THE deployment workflow SHALL perform a health check by sending an HTTP GET request to `https://admin.theroyalglow.in/api/health` and SHALL consider the deployment successful only if the endpoint returns HTTP 200 within 30 seconds, retrying up to 3 attempts with a 10-second delay between attempts
5. IF the health check fails after all 3 retry attempts, THEN THE deployment workflow SHALL mark the deployment as failed and send a failure notification
6. THE Admin_App SHALL have its own Sentry project for error monitoring, separate from the Web_App Sentry project, with source maps uploaded during each deployment

### Requirement 7: CORS and Security Configuration

**User Story:** As a developer, I want cross-origin requests between the admin and customer subdomains handled securely, so that API calls work correctly while maintaining a minimal attack surface.

#### Acceptance Criteria

1. THE Admin_App SHALL set CORS allowed origins to `https://admin.theroyalglow.in` only for its own API routes
2. IF a request arrives from an origin not in the allowed origins list, THEN THE Admin_App SHALL omit the `Access-Control-Allow-Origin` response header, causing the browser to reject the cross-origin request
3. THE Admin_App SHALL include CSP headers with `script-src 'self' 'nonce-<per-request>'` and `default-src 'self'` directives, disallowing inline scripts without a valid nonce and blocking resources from unlisted origins
4. THE Admin_App SHALL configure `@upstash/ratelimit` on admin API routes with a sliding window of 20 requests per 10-second window per authenticated user
5. IF a request exceeds the rate limit, THEN THE Admin_App SHALL respond with HTTP 429 and a `Retry-After` header indicating the number of seconds until the window resets
6. WHEN the Admin_App needs to call Web_App APIs (e.g., shared auth endpoints), THE Admin_App SHALL use server-side requests (not browser CORS) to avoid exposing cross-origin configuration
7. THE Admin_App SHALL set `X-Frame-Options: DENY` to prevent clickjacking

### Requirement 8: Realtime and Background Job Compatibility

**User Story:** As an admin user, I want Ably realtime channels and background job notifications to continue working on the admin subdomain, so that the live dashboard and alerts are unaffected by the migration.

#### Acceptance Criteria

1. THE Admin_App SHALL include an Ably token auth route (`/api/ably/token`) that issues subscribe-only tokens scoped to admin channels (`admin:bookings:*`, `admin:schedule:*`, `admin:leave`, `booking:*`) and requires the requesting user to hold a minimum role of Receptionist
2. THE Admin_App SHALL subscribe to existing Ably channels `admin:bookings:{branchId}`, `admin:schedule:{YYYY-MM-DD}`, and `admin:leave` on the corresponding admin page mount, using the same channel names and event schemas as the current deployment
3. WHEN a background job (QStash) publishes to Ably admin channels (e.g., stale pending alert publishes to `admin:bookings:{branchId}`), THE Admin_App SHALL receive and render the event identically to the current deployment without requiring changes to the job's publish target or payload schema
4. THE Admin_App SHALL host QStash webhook receiver routes (`/api/jobs/stale-booking-alert`, `/api/jobs/noshow-check`) that verify the QStash HMAC signature before processing the request body
5. IF the Ably connection is lost while an admin page is active, THEN THE Admin_App SHALL display a visible reconnecting indicator within 2 seconds and automatically re-subscribe to all previously subscribed channels upon reconnection

### Requirement 9: Web App Cleanup

**User Story:** As a developer, I want all admin-related code removed from the Web_App after migration, so that the customer-facing application is leaner and has a smaller attack surface.

#### Acceptance Criteria

1. WHEN migration is complete, THE Web_App SHALL have no files under `src/app/admin/`, `src/app/api/admin/`, `src/lib/admin/`, or `src/components/admin/`
2. WHEN migration is complete, THE Web_App middleware SHALL not contain the `/admin/:path*` matcher entry nor any admin-role-check logic in its route handler
3. THE Web_App SHALL retain routes shared with customers: `/api/auth`, `/api/bookings`, `/api/services`, `/api/availability`, `/api/ably/token`
4. IF a user navigates to any path matching `/admin` or `/admin/*` on `theroyalglow.in`, THEN THE Web_App SHALL return an HTTP 301 redirect to `https://admin.theroyalglow.in` with the sub-path preserved (e.g., `/admin/bookings` redirects to `https://admin.theroyalglow.in/bookings`)
5. WHEN migration is complete, THE Web_App SHALL produce a successful build (`bun run build`) with zero unresolved imports referencing removed admin modules

### Requirement 10: CI/CD Pipeline Updates

**User Story:** As a developer, I want the CI/CD pipeline to build and deploy the admin app independently, so that admin deployments do not require a full customer site redeploy and vice versa.

#### Acceptance Criteria

1. THE CI workflow SHALL run lint, typecheck, and test for Admin_App and Web_App as separate parallel jobs, where each job completes independently and reports its own pass/fail status within a total workflow timeout of 15 minutes
2. WHEN files change only in `apps/admin/` or `packages/`, THE deployment pipeline SHALL deploy Admin_App without triggering a Web_App deployment
3. WHEN files change only in `apps/web/` or `packages/`, THE deployment pipeline SHALL deploy Web_App without triggering an Admin_App deployment
4. WHEN files change in both `apps/admin/` and `apps/web/` (or in `packages/`), THE deployment pipeline SHALL deploy both Admin_App and Web_App independently in parallel
5. THE Turborepo_Pipeline SHALL support `turbo run build --filter=@repo/admin` to build Admin_App in isolation
6. THE CI workflow SHALL run Lighthouse CI against `admin.theroyalglow.in` with thresholds: performance ≥ 90, accessibility = 100, best practices ≥ 95, and SHALL fail the pipeline if any threshold is not met
7. IF either Admin_App or Web_App build fails during deployment, THEN THE deployment pipeline SHALL not deploy the failed app while still allowing the other app to deploy successfully if its build passed

### Requirement 11: Documentation and Steering File Updates

**User Story:** As a developer, I want all project documentation and steering files updated to reflect the new subdomain architecture, so that future development is guided by accurate information.

#### Acceptance Criteria

1. THE project-overview steering file SHALL list `apps/admin/` as a separate entry under the monorepo structure tree, annotated as a Next.js App Router application served from `admin.theroyalglow.in`, and SHALL document the full subdomain map (`theroyalglow.in`, `admin.theroyalglow.in`, `cms.theroyalglow.in`, `docs.theroyalglow.in`, `r2.theroyalglow.in`)
2. THE coding-standards steering file SHALL document the Root-Path Convention under the "Route Groups" section, specifying that routes within `apps/admin/` omit the `admin/` prefix since the subdomain provides the admin namespace
3. THE implementation-tasks steering file SHALL update all Phase 3 task paths from `apps/web/app/admin/` to `apps/admin/app/` and update the Phase 3 section title to reference the standalone Admin_App
4. THE features steering file SHALL document under the "Admin Portal (RBAC)" section that admin routes are served from `admin.theroyalglow.in` (root paths) instead of the `/admin` path on `theroyalglow.in`
5. THE deployment documentation SHALL include a dedicated Admin_App section covering: the Cloudflare Pages project name, the GitHub Actions deploy workflow file name, the build command, the output directory, and the health check endpoint path
6. THE project-overview Layer Rules table SHALL show `apps/admin/` as a Presentation and API layer with the same import permissions as `apps/web/`

### Requirement 12: Environment Variable Isolation

**User Story:** As a developer, I want the Admin_App to have its own environment variable configuration, so that secrets and service keys can be scoped per application.

#### Acceptance Criteria

1. THE Admin_App SHALL have its own `src/env.ts` file validating environment variables with `@t3-oss/env-nextjs` + Zod, and IF any required variable is missing or fails its Zod schema at build time, THEN THE Admin_App build SHALL fail immediately with an error message indicating which variable(s) failed validation
2. THE Admin_App SHALL declare the same `DATABASE_URL` and `DATABASE_URL_UNPOOLED` variable names as Web_App, validated as `z.string().url()`, pointing to the same Neon database branch per environment
3. THE Admin_App SHALL declare its own `NEXT_PUBLIC_SENTRY_DSN` (validated as `z.string().url()`), its own `NEXT_PUBLIC_APP_URL` (validated as `z.string().url()`, set to `https://admin.theroyalglow.in` in production), and its own `ABLY_API_KEY` (validated as `z.string().min(1)`) matching the naming conventions used in Web_App's `env.ts`
4. THE Admin_App SHALL have its own `.env.local` (listed in the root `.gitignore`) and `.env.example` (committed to Git) documenting every required variable with placeholder values and descriptive comments
5. THE Admin_App SHALL NOT include `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_CLARITY_ID`, or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in its `env.ts` schema unless a corresponding admin feature requires it; customer-facing tracking variables are exclusive to Web_App
6. IF the `SKIP_ENV_VALIDATION` environment variable is set to a truthy value, THEN THE Admin_App SHALL bypass env validation so that CI builds and Docker image creation can proceed without all runtime secrets present

### Requirement 13: Shared UI and Design Token Consistency

**User Story:** As a developer, I want the Admin_App to reuse the project's design tokens and shared UI primitives, so that the admin portal stays visually consistent and I avoid duplicating component code.

#### Acceptance Criteria

1. THE Admin_App SHALL use the same Tailwind CSS v4 design tokens (colours, spacing, typography, radii) as the Web_App, sourced from the shared design token definitions rather than redefined locally
2. WHEN a shadcn/ui primitive (button, dialog, table, form field) is used by both Web_App and Admin_App, THE primitive SHALL be sourced from a single shared location (a `packages/ui` workspace package or an equivalent shared directory) to avoid divergent copies
3. IF a shared UI package is introduced, THEN both Web_App and Admin_App SHALL consume it via the `workspace:*` protocol and the build SHALL produce zero duplicate-component type conflicts
4. THE Admin_App SHALL meet the same accessibility bar as Web_App: WCAG 2.1 AA, Lighthouse accessibility = 100, visible focus rings, keyboard navigation, and `prefers-reduced-motion` support

### Requirement 14: Phased Cutover and Rollback

**User Story:** As a developer, I want the migration to be reversible and verifiable at each step, so that I can cut over to the new admin subdomain without risking admin operations downtime.

#### Acceptance Criteria

1. THE migration SHALL proceed in verifiable phases (scaffold → page migration → API migration → auth/RBAC → deploy → cleanup), where each phase is independently buildable and testable before the next begins
2. WHILE the Admin_App is being validated in pre-production, THE Web_App `/admin` routes SHALL remain functional so that admin operations are not interrupted before cutover is confirmed
3. WHEN the Admin_App passes its health check and smoke tests on `admin.theroyalglow.in`, THEN the Web_App cleanup (Requirement 9) and the 301 redirect SHALL be enabled as the final cutover step
4. IF the Admin_App deployment is found broken after cutover, THEN the team SHALL be able to roll back by re-pointing DNS and re-enabling the Web_App `/admin` routes from version control without data loss, since no database schema changes are introduced by this migration
5. THE migration SHALL NOT introduce any database schema changes; both apps read and write the same Neon tables through the shared `@repo/db` package

### Requirement 15: Testing and Verification

**User Story:** As a developer, I want automated tests covering the migrated admin app, so that I can confirm RBAC, routing, and data operations behave identically after the migration.

#### Acceptance Criteria

1. THE Admin_App SHALL include unit tests (Vitest) for the Admin_Middleware role-resolution and access-control logic, covering each role level against each route-level minimum
2. THE Admin_App SHALL include E2E tests (Playwright) that verify: an unauthenticated visitor is redirected to `https://theroyalglow.in`; a Receptionist can reach `/bookings` but receives 403 on `/users`; an Owner can reach `/users`; and a Developer can reach `/logs`
3. THE Admin_App SHALL include at least one smoke test per migrated top-level route asserting the page renders without runtime error for an authorized role
4. WHEN the test suite runs in CI, THE Admin_App tests SHALL execute as part of the `test` task and SHALL block deployment on failure
5. THE migration SHALL include a verification check confirming the `theroyalglow.in/admin/*` → `https://admin.theroyalglow.in/*` 301 redirect resolves correctly for at least the dashboard and `/bookings` paths
