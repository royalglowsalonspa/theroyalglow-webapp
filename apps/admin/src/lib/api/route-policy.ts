/************************************************************
 * Module Name  : route-policy (admin)
 * Scope        : API Infrastructure — route classification (multi-branch R2.5)
 *
 * Description  : Every admin API route and the authorization policy each of
 *                its methods follows. `route-policy.test.ts` reads the route
 *                files on disk and fails on a route or method missing here,
 *                an entry for a route that no longer exists, and a handler
 *                whose guard doesn't match its policy. Behaviour is proven by
 *                each route's own tests; this inventory keeps new entry points
 *                from arriving unclassified.
 *
 * Policies     :
 * - branch       : branch-owned records. requireBranchRole, queries scoped by
 *                  record and active branch together, rendered branch on writes
 * - people       : role and staff administration at the active branch
 * - shared_money : a shared record whose money and history are limited to the
 *                  active branch (R3.2); needs branch context too
 * - shared       : the same for every branch; no branch money in responses
 * - developer    : Developer only, across all branches
 * - self         : the signed-in person's own data
 * - job          : QStash-signed; branch scope comes from the job's records
 * - auth, health : Better Auth's handler; the unauthenticated health probe
 * - retired      : answers 410 Gone (catalogue writes moved to Payload CMS)
 ************************************************************/

export type RoutePolicy =
  | 'branch'
  | 'people'
  | 'shared_money'
  | 'shared'
  | 'developer'
  | 'self'
  | 'job'
  | 'auth'
  | 'health'
  | 'retired'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** A route's methods and their policies. */
export type RouteMethods = Partial<Record<HttpMethod, RoutePolicy>>

const job: RouteMethods = { POST: 'job' }

/**
 * Admin API routes, keyed by their folder under `src/app/api` (as Next.js
 * names them, `[id]` segments included).
 */
export const ADMIN_ROUTE_POLICIES = {
  'ably/token': { POST: 'branch' },
  'auth/[...all]': { GET: 'auth', POST: 'auth' },
  billing: { GET: 'branch' },
  'billing/[id]': { GET: 'branch' },
  bookings: { GET: 'branch' },
  'bookings/new': { POST: 'branch' },
  'bookings/[id]': { GET: 'branch', PATCH: 'branch' },
  'bookings/[id]/complete': { POST: 'branch' },
  'bookings/[id]/noshow': { POST: 'branch' },
  branches: { GET: 'shared', POST: 'developer' },
  'branches/owner-candidates': { GET: 'developer' },
  'branches/[id]': { PATCH: 'developer', DELETE: 'developer' },
  'branches/[id]/shutdown-check': { GET: 'developer' },
  closures: { GET: 'branch', POST: 'branch' },
  'closures/[id]': { DELETE: 'branch' },
  customers: { GET: 'shared_money' },
  'customers/[id]': { GET: 'shared_money', PATCH: 'shared_money' },
  'customers/[id]/notes': { POST: 'shared_money' },
  'customers/[id]/tags': { POST: 'shared' },
  'customers/[id]/tags/[tagId]': { DELETE: 'shared' },
  health: { GET: 'health' },
  integrations: { GET: 'developer' },
  'jobs/appointment-reminders': job,
  'jobs/birthday-emails': job,
  'jobs/customer-stats-reconcile': job,
  'jobs/daily-sales-report': job,
  'jobs/gems-auto-expire': job,
  'jobs/gems-expiry-reminder': job,
  'jobs/invoice-pdf': job,
  'jobs/lead-followups': job,
  'jobs/membership-auto-expire': job,
  'jobs/membership-expired-notice': job,
  'jobs/membership-expiry': job,
  'jobs/membership-usage-nudges': job,
  'jobs/missing-manager-reminder': job,
  'jobs/monthly-gst-summary': job,
  'jobs/nightly-sales-summary': job,
  'jobs/noshow-check': job,
  'jobs/offer-auto-expire': job,
  'jobs/pending-booking-closeout': job,
  'jobs/realtime-revocations': job,
  'jobs/post-service-followup': job,
  'jobs/service-drift-reconcile': job,
  'jobs/session-cleanup': job,
  'jobs/stale-booking-alert': job,
  'jobs/weekly-report': job,
  leads: { GET: 'branch', POST: 'branch' },
  'leads/[id]': { GET: 'branch', PATCH: 'branch' },
  'leads/[id]/notes': { POST: 'branch' },
  leave: { GET: 'branch' },
  'leave/[id]': { PATCH: 'branch' },
  logs: { GET: 'developer' },
  'me/branch': { GET: 'self', PUT: 'self' },
  'me/leave': { GET: 'self', POST: 'self' },
  'me/leave/[id]': { DELETE: 'self' },
  'me/schedule': { GET: 'self' },
  'membership-tiers': { GET: 'shared' },
  memberships: { GET: 'shared_money', POST: 'branch' },
  'memberships/[id]': { GET: 'shared_money' },
  // Cancelling stays with the selling branch (route inventory gap 5).
  'memberships/[id]/cancel': { POST: 'branch' },
  'memberships/[id]/sessions': { POST: 'branch' },
  notifications: { GET: 'self', PATCH: 'self' },
  offers: { GET: 'shared', POST: 'shared' },
  'offers/[id]': { GET: 'shared', PATCH: 'shared' },
  reports: { GET: 'branch' },
  schedule: { GET: 'branch', PUT: 'branch' },
  'service-categories': { GET: 'shared', POST: 'retired' },
  'service-categories/[id]': { PATCH: 'retired' },
  services: { GET: 'shared', POST: 'retired' },
  'services/all': { GET: 'shared' },
  'services/[id]': { PATCH: 'retired' },
  settings: { GET: 'developer', PUT: 'developer' },
  staff: { GET: 'branch', POST: 'people' },
  'staff/all': { GET: 'people' },
  'staff/candidates': { GET: 'people' },
  'staff/[id]': { GET: 'people', PATCH: 'people' },
  'staff/[id]/remove': { POST: 'people' },
  'staff/[id]/services': { PUT: 'people' },
  tags: { GET: 'shared', POST: 'shared' },
  users: { GET: 'people', POST: 'people' },
  'users/branch-roles': { GET: 'people' },
  waitlist: { GET: 'branch' },
  'waitlist/[id]': { PATCH: 'branch' },
} as const satisfies Record<string, RouteMethods>

export type AdminRoute = keyof typeof ADMIN_ROUTE_POLICIES

/** Policies that act on one active branch and so need its context. */
export const BRANCH_CONTEXT_POLICIES: ReadonlySet<RoutePolicy> = new Set([
  'branch',
  'people',
  'shared_money',
])
