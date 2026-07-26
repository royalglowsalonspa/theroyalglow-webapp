/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Migrated Routes Smoke Tests
 * Scope        : Admin Portal — Route-Consistency Verification
 *
 * Description  : Route-consistency smoke tests for the migrated admin feature
 *                areas. Each migrated top-level route renders its primary
 *                presentational component (the place where render risk actually
 *                lives) under jsdom with empty API data, for an authorized role,
 *                and is asserted to (a) mount, fetch, and settle into its empty
 *                state without throwing; (b) use the redesigned design-system
 *                primitives where applicable (Data_Table / Filter_Bar /
 *                Status_Badge / state presenters); and (c) keep its
 *                pre-redesign user actions available. A final group renders a
 *                representative route INSIDE the AdminShell to prove authed
 *                routes mount within the App_Shell frame (Req 17.1).
 *
 * Responsibilities :
 * - Cover one render-without-error assertion per migrated feature area:
 *   dashboard, bookings, customers, leads, leave, memberships, offers,
 *   schedule (Root-Path Convention, Req 2.1)
 * - Assert the Filter_Bar primitive is rendered where a route exposes
 *   search/filter controls, and the Status_Badge primitive renders a label
 *   (Req 17.2, 17.3, 17.5)
 * - Assert pre-redesign actions (e.g. Manual Lead, Create Offer) are preserved
 *   (Req 17.6, 17.7)
 * - Assert a migrated route renders within AdminShell (Req 17.1)
 * - Stub `fetch` so client components resolve to empty, valid envelopes
 *   ({ success: true, data }) routed by URL — no DB or network required
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, TypeScript
 * Layer        : Testing (Presentation smoke checks)
 *
 * Dependencies : migrated feature components, AdminShell, @testing-library/react
 *
 * Notes        :
 * - Async Server Component `page.tsx` files that read @rgss/db are NOT rendered
 *   here (jsdom has no DB). They delegate all render logic to the client
 *   components exercised below. The /leads route renders LeadsTable (the
 *   migrated DataTable/FilterBar list) — its entire body is that client
 *   component, covered directly. (Per decision B1 the legacy LeadKanban is
 *   intentionally out of scope and is no longer the route component.)
 * - The migrated tables use next/navigation (useRouter for row navigation,
 *   usePathname for the sidebar/breadcrumb). There is no App Router context in
 *   jsdom, so the navigation hooks are stubbed. next/link is rendered as a
 *   plain anchor; RealtimeProvider + NotificationBell are stubbed so AdminShell
 *   mounts with no Ably/network access — mirroring admin-shell.test.tsx.
 * - Validates: Requirements 2.1, 15.3, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// next/navigation has no App Router context in jsdom. Stub useRouter (used by
// the bookings row "View details" action) and pin usePathname to '/' so the
// sidebar + breadcrumb derive a stable trail when AdminShell renders.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
}))

// Render next/link as a plain anchor — avoids needing an App Router context for
// the AdminShell sidebar/breadcrumb links.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string | { pathname?: string }
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <a
      href={typeof href === 'string' ? href : (href?.pathname ?? '#')}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}))

// RealtimeProvider pulls in Ably + the /api/ably/token route — stub to a no-op
// pass-through so AdminShell renders in jsdom with no network access.
vi.mock('@/components/realtime/realtime-provider', () => ({
  RealtimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// NotificationBell polls /api/notifications on mount — stub to nothing.
vi.mock('@/components/notifications/notification-bell', () => ({
  NotificationBell: () => null,
}))

import { BookingsTable } from '@/app/bookings/bookings-table'
import { CustomersTable } from '@/app/customers/customers-table'
import { DashboardOverview } from '@/app/dashboard-overview'
import { LeadsTable } from '@/app/leads/leads-table'
import { LeaveQueue } from '@/app/leave/leave-queue'
import { MembershipsList } from '@/app/memberships/memberships-list'
import { OffersManager } from '@/app/offers/offers-manager'
import { ScheduleGrid } from '@/app/schedule/schedule-grid'
import { AdminShell } from '@/components/layout/admin-shell'
import { StatusBadge } from '@/components/ui/status-badge'

// A successful `{ success, data, meta? }` envelope, as returned by every
// migrated admin API route.
function ok(data: unknown, meta?: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, meta }),
  } as Response
}

// Route the stubbed `fetch` by URL to the empty-but-valid shape each component
// expects, so the authorized-role render path reaches its empty state instead
// of an error. Order: more specific paths before their prefixes.
function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input)
  if (url.includes('/api/membership-tiers')) {
    return Promise.resolve(ok([]))
  }
  if (url.includes('/api/memberships')) {
    return Promise.resolve(ok([]))
  }
  if (url.includes('/api/bookings')) {
    return Promise.resolve(ok({ bookings: [] }))
  }
  if (url.includes('/api/customers')) {
    return Promise.resolve(ok({ customers: [] }, { page: 1, totalPages: 1, totalCount: 0 }))
  }
  if (url.includes('/api/tags')) {
    return Promise.resolve(ok({ tags: [] }))
  }
  if (url.includes('/api/offers')) {
    return Promise.resolve(ok({ offers: [] }))
  }
  if (url.includes('/api/services')) {
    return Promise.resolve(ok({ categories: [] }))
  }
  if (url.includes('/api/schedule')) {
    return Promise.resolve(ok({ dates: [], staff: [] }))
  }
  if (url.includes('/api/leave')) {
    return Promise.resolve(ok({ leave: [] }))
  }
  if (url.includes('/api/leads')) {
    return Promise.resolve(ok({ leads: [] }))
  }
  if (url.includes('/api/notifications')) {
    return Promise.resolve(ok({ notifications: [], unreadCount: 0 }))
  }
  return Promise.resolve(ok({}))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(routeFetch))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// One render-without-error assertion per migrated top-level feature area.
// Each waits for the component to settle (loading → empty) so React effects
// flush inside act(), proving the full mount path renders cleanly.
describe('migrated admin routes render without error (Req 2.1, 15.3)', () => {
  it('dashboard (/) renders the overview', async () => {
    render(<DashboardOverview />)
    expect(screen.getByRole('heading', { name: 'Recent Bookings' })).toBeInTheDocument()
    expect(await screen.findByText('No bookings yet.')).toBeInTheDocument()
  })

  it('bookings (/bookings) renders the table', async () => {
    render(<BookingsTable />)
    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeInTheDocument()
    expect(await screen.findByText('No bookings found')).toBeInTheDocument()
  })

  it('customers (/customers) renders the table', async () => {
    render(<CustomersTable />)
    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument()
    expect(await screen.findByText('No customers found')).toBeInTheDocument()
  })

  it('leads (/leads) renders the migrated list', async () => {
    render(<LeadsTable />)
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeInTheDocument()
    expect(await screen.findByText('No leads yet')).toBeInTheDocument()
  })

  it('leave (/leave) renders the queue', async () => {
    render(<LeaveQueue />)
    expect(screen.getByRole('heading', { name: 'Leave Requests' })).toBeInTheDocument()
    expect(await screen.findByText('No pending leave requests')).toBeInTheDocument()
  })

  it('memberships (/memberships) renders the list', async () => {
    render(<MembershipsList />)
    expect(screen.getByRole('heading', { name: 'Memberships' })).toBeInTheDocument()
    expect(await screen.findByText('No memberships found')).toBeInTheDocument()
  })

  it('offers (/offers) renders the manager', async () => {
    render(<OffersManager />)
    expect(screen.getByRole('heading', { name: 'Offers' })).toBeInTheDocument()
    expect(await screen.findByText('No offers found')).toBeInTheDocument()
  })

  it('schedule (/schedule) renders the grid', async () => {
    render(<ScheduleGrid />)
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument()
    expect(await screen.findByText('No active staff')).toBeInTheDocument()
  })
})

// Routes that expose search/filter controls render them via the Filter_Bar
// primitive (Req 17.5), and the Status_Badge primitive renders a labelled badge
// (Req 17.3). Both render in the route's empty state, so a settled empty render
// is enough to confirm the primitive is wired in.
describe('migrated routes use the redesigned primitives (Req 17.2, 17.3, 17.5)', () => {
  it('leads exposes its search control via the Filter_Bar primitive', async () => {
    render(<LeadsTable />)
    // The Filter_Bar search input (type=search → searchbox) carries the
    // route-configured accessible name.
    expect(screen.getByRole('searchbox', { name: 'Search leads' })).toBeInTheDocument()
    await screen.findByText('No leads yet')
  })

  it('offers exposes its search control via the Filter_Bar primitive', async () => {
    render(<OffersManager />)
    // OffersManager renders the Filter_Bar once the load settles, so wait for
    // the empty state before asserting the primitive's search control.
    await screen.findByText('No offers found')
    expect(screen.getByRole('searchbox', { name: 'Search offers by name' })).toBeInTheDocument()
  })

  it('StatusBadge renders a labeled badge for a known status', () => {
    render(<StatusBadge status="confirmed" />)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })
})

// Pre-redesign user actions remain available on the migrated routes (Req 17.6,
// 17.7). The list-level action affordances render regardless of data, so the
// empty render confirms they were preserved through the migration.
describe('migrated routes preserve their pre-redesign actions (Req 17.6, 17.7)', () => {
  it('leads keeps the Manual Lead creation action', async () => {
    render(<LeadsTable />)
    expect(screen.getByRole('button', { name: 'Manual Lead' })).toBeInTheDocument()
    await screen.findByText('No leads yet')
  })

  it('offers keeps the Create Offer action', async () => {
    render(<OffersManager />)
    expect(screen.getByRole('button', { name: '+ Create Offer' })).toBeInTheDocument()
    await screen.findByText('No offers found')
  })
})

// Authenticated admin routes render WITHIN the App_Shell, never in an
// alternative layout frame (Req 17.1). Rendering a representative migrated
// route inside AdminShell proves the shell chrome (sidebar toggle + breadcrumb)
// and the route content mount together in the one <main> region.
describe('authenticated routes render within AdminShell (Req 17.1)', () => {
  it('mounts a migrated route inside the shell with the chrome and content together', async () => {
    render(
      // biome-ignore lint/a11y/useValidAriaRole: `role` here is the AdminShell RBAC role prop, not an ARIA role.
      <AdminShell role="owner" userName="Asha Rao" userInitials="AR">
        <LeadsTable />
      </AdminShell>,
    )

    // App_Shell chrome: the Top_Bar sidebar toggle + the Breadcrumb landmark.
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()

    // The route content renders inside the shell's single <main> region.
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { name: 'Leads' })).toBeInTheDocument()
    expect(await within(main).findByText('No leads yet')).toBeInTheDocument()
  })
})
