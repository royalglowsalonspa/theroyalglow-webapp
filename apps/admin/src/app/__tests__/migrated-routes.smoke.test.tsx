/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Migrated Routes Smoke Tests
 * Scope        : Admin Portal — Page Migration Verification
 *
 * Description  : Render-without-error smoke tests for the migrated admin
 *                feature areas. Each migrated top-level route renders its
 *                primary presentational component (the place where render
 *                risk actually lives) under jsdom with empty API data, for
 *                an authorized role, and is asserted to mount, fetch, and
 *                settle into its empty state without throwing.
 *
 * Responsibilities :
 * - Cover one render-without-error assertion per migrated feature area:
 *   dashboard, bookings, customers, leads, leave, memberships, offers,
 *   schedule (Root-Path Convention, Req 2.1)
 * - Stub `fetch` so client components resolve to empty, valid envelopes
 *   ({ success: true, data }) routed by URL — no DB or network required
 *
 * Features / Functionality :
 * - URL-routed fetch stub matching each admin API endpoint's shape
 * - Awaits each component's empty state so async effects settle in act()
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, TypeScript
 * Layer        : Testing (Presentation smoke checks)
 *
 * Dependencies : migrated feature components, @testing-library/react
 *
 * Notes        :
 * - Async Server Component `page.tsx` files that read @rgss/db are NOT
 *   rendered here (jsdom has no DB). They delegate all render logic to the
 *   client components exercised below, plus the leads page whose entire body
 *   is the LeadKanban client component covered directly.
 * - Validates: Requirements 2.1, 15.3
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardOverview } from '@/app/dashboard-overview'

import { BookingsTable } from '@/app/bookings/bookings-table'
import { CustomersTable } from '@/app/customers/customers-table'
import { LeaveQueue } from '@/app/leave/leave-queue'
import { MembershipsList } from '@/app/memberships/memberships-list'
import { OffersManager } from '@/app/offers/offers-manager'
import { ScheduleGrid } from '@/app/schedule/schedule-grid'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { LeadKanban } from '@/components/lead/LeadKanban'

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

  it('leads (/leads) renders the pipeline board', async () => {
    render(<LeadKanban />)
    expect(screen.getByRole('heading', { name: 'Lead Pipeline' })).toBeInTheDocument()
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
    expect(await screen.findByText('No offers yet')).toBeInTheDocument()
  })

  it('schedule (/schedule) renders the grid', async () => {
    render(<ScheduleGrid />)
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument()
    expect(await screen.findByText('No active staff')).toBeInTheDocument()
  })

  it('StatusBadge renders a labeled badge for a known status', () => {
    render(<StatusBadge status="confirmed" />)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })
})
