# Requirements Document

## Introduction

This feature completes the admin→web architectural separation that began with the
earlier admin-subdomain migration. After that migration, the admin portal lives in
`apps/admin` (served at `admin.theroyalglow.in` using the Root-Path Convention — no
`/admin` prefix) and the customer site lives in `apps/web` (served at
`theroyalglow.in`). `apps/web` already has no `app/admin/*` pages and no
`app/api/admin/*` routes, and `apps/admin` already hosts manager-level schedule, leave
management, and staff management.

The remaining gap is the **staff self-service** surfaces still living in `apps/web`.
These are admin-portal operations (a signed-in `staff` user acting on their OWN
schedule and leave), so they belong on the admin subdomain. The leftover artifacts are:

- Pages: `apps/web/src/app/staff/layout.tsx`, `apps/web/src/app/staff/schedule/page.tsx`,
  `apps/web/src/app/staff/leave/page.tsx`, `apps/web/src/app/staff/leave/staff-leave-panel.tsx`
- APIs (all gated `requireRole('staff')`): `apps/web/src/app/api/staff/schedule/route.ts`
  (GET own schedule), `apps/web/src/app/api/staff/leave/route.ts` (GET/POST own leave),
  `apps/web/src/app/api/staff/leave/[id]/route.ts` (DELETE/withdraw own pending leave)

The goal: relocate every staff self-service surface to `apps/admin`, make `apps/web`
contain ONLY public/customer code, and have `apps/web` permanently redirect legacy
`/staff/*` (and any residual `/admin/*`) paths to the admin subdomain — consistent with
the existing `mapAdminRedirect` 301 convention. Public customer surfaces such as the
Meta-ad lead capture page (`(landing)/book`) and its `LeadCaptureForm` MUST stay in
`apps/web`.

A core complication this feature must resolve at the requirements level: the `staff`
role sits BELOW `receptionist` in the hierarchy (Customer < Staff < Receptionist <
Manager < Owner < Developer), and the admin RBAC defaults every route to a minimum of
`receptionist` (level 2). The admin app's `/staff` route already means *manager-level
staff management* (level 3). So the relocated staff self-service surfaces need an
explicit access rule that grants the `staff` role access to ONLY their own
schedule/leave surfaces on the admin subdomain, without granting them the
receptionist+ dashboard or the manager-level staff-management route.

## Glossary

- **Web_App**: The customer website application at `apps/web`, served at
  `theroyalglow.in`. Public + authenticated customer surfaces only.
- **Admin_App**: The admin portal application at `apps/admin`, served at
  `admin.theroyalglow.in` using the Root-Path Convention (no `/admin` prefix).
- **Web_Middleware**: The Next.js edge middleware in `apps/web/src/middleware.ts`.
- **Admin_RBAC**: The pure role-based access-control decision core in
  `apps/admin/src/lib/rbac.ts` (`ROLE_LEVELS`, `ROUTE_MIN_LEVEL`, `routeMinLevel`,
  `decide`, `filterNavByLevel`, `ADMIN_NAV`).
- **Staff_Self_Service**: The set of surfaces where a signed-in user with the `staff`
  role views their OWN weekly schedule and submits/withdraws their OWN leave requests.
- **Staff_Management**: The manager-level (level 3) admin surfaces at `/staff` and
  `/schedule` and `/leave` (approval queue) that operate on ALL staff members' data.
- **Admin_Redirect_Map**: The pure mapping `mapAdminRedirect` in
  `apps/web/src/lib/admin-redirect.ts` that translates legacy `/admin/*` paths to the
  admin origin, dropping the `/admin` prefix and preserving the remainder and query.
- **Staff_Redirect_Map**: A pure mapping (new or extended) in `apps/web` that
  translates legacy `/staff/*` paths to their canonical Admin_App destination,
  preserving deep-link sub-paths and query strings.
- **Role_Level**: The numeric rank of a role per `ROLE_LEVELS` (customer 0, staff 1,
  receptionist 2, manager 3, owner 4, developer 5).
- **Shared_Session_Cookie**: The Better Auth session cookie scoped to
  `.theroyalglow.in`, recognised across both subdomains.
- **Lead_Capture**: The public Meta-ad lead capture page at
  `apps/web/src/app/(landing)/book` and `apps/web/src/components/lead/LeadCaptureForm.tsx`.
- **Breadcrumb_Comment**: A short comment (or the redirect handler itself) left at or
  near a removed location indicating the canonical surface now lives in the Admin_App.

## Requirements

### Requirement 1: Relocate staff self-service pages to the Admin_App

**User Story:** As a staff member, I want my schedule and leave self-service pages to
live on the admin subdomain, so that all admin-portal surfaces are served from one app.

#### Acceptance Criteria

1. THE Admin_App SHALL provide a staff self-service schedule page that displays the
   authenticated staff member's own weekly working hours as read-only.
2. THE Admin_App SHALL provide a staff self-service leave page that allows the
   authenticated staff member to submit a leave request and view their own leave history.
3. THE Admin_App SHALL provide a staff self-service layout that gates rendering on a
   valid session and presents navigation limited to the staff self-service schedule and
   leave surfaces.
4. WHERE a signed-in staff member has no linked staff profile, THE Admin_App SHALL
   render an explicit "no staff profile" state on the schedule self-service surface.
5. THE Admin_App SHALL allow the authenticated staff member to withdraw their own leave
   request WHILE that request is in the `pending` state.
6. WHEN the staff self-service pages are relocated, THE Web_App SHALL contain no staff
   self-service page files under `apps/web/src/app/staff`.

### Requirement 2: Relocate staff self-service APIs to the Admin_App

**User Story:** As a staff member, I want the API endpoints that serve my own schedule
and leave to live on the admin subdomain, so that the customer site holds no
admin-portal logic.

#### Acceptance Criteria

1. THE Admin_App SHALL expose an endpoint that returns the authenticated staff member's
   own weekly schedule scoped strictly to that staff member's staff profile.
2. THE Admin_App SHALL expose an endpoint that returns the authenticated staff member's
   own leave history scoped strictly to that staff member's staff profile.
3. WHEN a staff member submits a leave request for a date, THE Admin_App SHALL create
   the request in the `pending` state scoped to that staff member's staff profile.
4. IF a staff member submits a leave request for a date on which they already have a
   request, THEN THE Admin_App SHALL return a `409 Conflict` response with a descriptive
   message rather than a raw database constraint error.
5. WHEN a staff member requests withdrawal of a leave request that is not theirs, does
   not exist, or is already decided, THE Admin_App SHALL return a `404 Not Found`
   response that does not reveal another staff member's data.
6. THE Admin_App staff self-service endpoints SHALL require a minimum Role_Level of
   `staff`.
7. WHEN the staff self-service APIs are relocated, THE Web_App SHALL contain no staff
   self-service route files under `apps/web/src/app/api/staff`.

### Requirement 3: Grant the staff role access to only its own surfaces on the Admin_App

**User Story:** As the system owner, I want staff users to reach only their own
schedule and leave surfaces on the admin subdomain, so that they cannot reach the
receptionist+ dashboard or manager-level staff management.

#### Acceptance Criteria

1. THE Admin_RBAC route table SHALL define the staff self-service routes with a minimum
   Role_Level of `staff`.
2. WHILE a user holds the `staff` Role_Level, THE Admin_App SHALL grant access to the
   staff self-service schedule and leave routes.
3. WHILE a user holds the `staff` Role_Level, THE Admin_App SHALL return a `403
   Forbidden` response for the dashboard root route and for every route whose minimum
   Role_Level is `receptionist` or higher.
4. THE Admin_RBAC SHALL resolve the staff self-service routes to the `staff` minimum
   Role_Level via longest-prefix matching without lowering the minimum Role_Level of the
   manager-level Staff_Management route at `/staff`.
5. WHILE a user holds a Role_Level below `staff`, THE Admin_App SHALL deny access to the
   staff self-service routes.
6. WHERE the Admin_App renders role-aware navigation, THE Admin_App SHALL show a staff
   self-service user only the navigation entries whose minimum Role_Level is at or below
   `staff`.

> **Open consideration (resolve in design, not here):** The Admin_App's `/staff` prefix
> currently maps to manager level (3) for Staff_Management. The relocated
> Staff_Self_Service surfaces therefore need a route namespace that does NOT collide
> with `/staff` (for example a dedicated `me/*` or `my/*` namespace), or an explicit
> longest-prefix RBAC entry that resolves the self-service routes to level 1 without
> weakening `/staff`. The design must pick one approach and keep `Admin_RBAC` and the
> sidebar nav config (`ADMIN_NAV`) in agreement.

### Requirement 4: Redirect legacy staff paths from the Web_App to the Admin_App

**User Story:** As a staff member with an old bookmark, I want legacy `theroyalglow.in/staff/*`
links to take me to the corresponding admin subdomain page, so that my saved links keep working.

#### Acceptance Criteria

1. WHEN the Web_Middleware receives a request for `/staff` or any `/staff/`-prefixed
   path, THE Web_App SHALL respond with a permanent `301` redirect to the corresponding
   Admin_App destination.
2. THE Staff_Redirect_Map SHALL preserve the deep-link sub-path of a legacy `/staff/*`
   request when producing the Admin_App destination.
3. THE Staff_Redirect_Map SHALL preserve the query string of a legacy `/staff/*`
   request verbatim when producing the Admin_App destination.
4. WHEN the Web_Middleware receives a request for `/admin` or any `/admin/`-prefixed
   path, THE Web_App SHALL respond with a permanent `301` redirect to the Admin_App per
   the existing Admin_Redirect_Map.
5. THE Web_Middleware SHALL apply the legacy `/staff/*` and `/admin/*` redirects before
   any session check so that unauthenticated visitors are redirected.
6. FOR ALL legacy `/staff/*` paths, applying the Staff_Redirect_Map and then re-mapping
   the resulting Admin_App path SHALL produce the same Admin_App destination
   (idempotent mapping).
7. THE Staff_Redirect_Map SHALL be a pure function with no framework or edge-runtime
   dependency.

### Requirement 5: Constrain the Web_App to public and customer surfaces only

**User Story:** As a developer, I want the customer site to contain only
public/customer code, so that the separation between the two apps is clean and
maintainable.

#### Acceptance Criteria

1. THE Web_App SHALL retain its public and authenticated customer surfaces, including
   customer pages, customer booking APIs, services, availability, and the leads `POST`
   endpoint.
2. THE Web_App SHALL contain no page directory under `apps/web/src/app/admin`.
3. THE Web_App SHALL contain no API route directory under `apps/web/src/app/api/admin`.
4. THE Web_App SHALL contain no staff self-service page directory under
   `apps/web/src/app/staff` after relocation, except surfaces required solely to perform
   the legacy redirect.
5. THE Web_App SHALL contain no staff self-service API directory under
   `apps/web/src/app/api/staff` after relocation.
6. THE Web_Middleware SHALL contain no admin or staff role-based access-control logic
   beyond the legacy redirect branches.

### Requirement 6: Preserve public lead-capture surfaces in the Web_App

**User Story:** As a marketing manager, I want the public Meta-ad lead capture page to
remain on the customer site, so that ad traffic continues to convert without
authentication.

#### Acceptance Criteria

1. THE Web_App SHALL retain the public Lead_Capture page at
   `apps/web/src/app/(landing)/book`.
2. THE Web_App SHALL retain the `LeadCaptureForm` component at
   `apps/web/src/components/lead/LeadCaptureForm.tsx`.
3. THE Web_App SHALL allow access to the Lead_Capture page without an authenticated
   session.
4. THE Web_App SHALL NOT redirect the Lead_Capture page to the Admin_App.

### Requirement 7: Share the authenticated session across subdomains

**User Story:** As a staff member, I want to stay signed in when I move from the
customer site to the admin subdomain, so that I do not have to authenticate twice.

#### Acceptance Criteria

1. WHILE a staff member holds a valid Shared_Session_Cookie established on the Web_App,
   THE Admin_App SHALL recognise that session on `admin.theroyalglow.in`.
2. THE Shared_Session_Cookie SHALL be scoped to `.theroyalglow.in` so that both
   subdomains read the same session.
3. WHEN a staff member follows a legacy `/staff/*` redirect from the Web_App to the
   Admin_App, THE Admin_App SHALL authorise the request using the existing
   Shared_Session_Cookie without requiring re-authentication.

### Requirement 8: Cleanup hygiene and no duplicated staff self-service logic

**User Story:** As a developer, I want removed web files to point to their new canonical
location and no logic duplicated across apps, so that future maintenance is
unambiguous.

#### Acceptance Criteria

1. WHERE a staff self-service surface is removed from the Web_App, THE Web_App SHALL
   indicate the canonical Admin_App location via a Breadcrumb_Comment or via the
   redirect handler.
2. THE codebase SHALL contain exactly one implementation of each staff self-service
   surface, located in the Admin_App.
3. THE Web_App SHALL contain no import that resolves to a staff self-service module
   after relocation.
4. THE relocated Admin_App staff self-service surfaces SHALL reuse the Admin_App's
   existing session, RBAC, error-handling, and database-query conventions rather than
   introducing parallel implementations.

### Requirement 9: Verify the separation

**User Story:** As a developer, I want automated verification that the separation is
complete, so that I can merge with confidence.

#### Acceptance Criteria

1. WHEN the type checker runs across the workspace, THE workspace SHALL report no type
   errors introduced by this feature.
2. WHEN the linter runs across the workspace, THE workspace SHALL report no lint errors
   introduced by this feature.
3. THE Web_App SHALL contain no unresolved or dead import referencing a relocated staff
   self-service module.
4. THE verification SHALL assert by static check that no staff self-service page or API
   directory remains in the Web_App except surfaces required solely for the legacy
   redirect.
5. THE verification SHALL assert that the Staff_Redirect_Map maps representative legacy
   `/staff/*` paths (including deep links with query strings) to their expected
   Admin_App destinations.
6. THE verification SHALL assert that the Admin_RBAC grants the `staff` Role_Level
   access to the staff self-service routes and forbids the `staff` Role_Level on the
   dashboard root and all receptionist-or-higher routes.
7. THE feature SHALL introduce no new database migration.
