/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : routes (a11y test)
 * Scope        : Admin — Representative redesigned routes accessibility
 *
 * Description  : Vitest + React Testing Library + jest-axe accessibility tests
 *                for representative redesigned admin routes. Async Server
 *                Component `page.tsx` files read @rgss/db and cannot render
 *                under jsdom, so each route's primary client presentational
 *                component (where the render surface actually lives) is rendered
 *                here with `fetch` stubbed to empty, valid envelopes and
 *                `next/navigation` stubbed, then audited for zero axe
 *                violations once it settles into its loaded state.
 *
 * Responsibilities :
 * - Assert `axe(container).toHaveNoViolations()` for the Dashboard overview
 *   (`/`) and the Bookings table (`/bookings`) once settled (Req 13.1)
 * - Stub `fetch` so client components resolve to empty, valid envelopes — no
 *   DB or network required
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (presentation — routes)
 *
 * Dependencies : @/app/dashboard-overview, @/app/bookings/bookings-table,
 *                next/navigation (mocked)
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. jest-axe matchers
 *                are registered locally via expect.extend(toHaveNoViolations).
 *                The dashboard hosts a recharts ChartCard; ResponsiveContainer
 *                measures the DOM via the ResizeObserver polyfill from
 *                src/test/setup and renders an empty (zero-size) host in jsdom.
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.5
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BookingsTable uses next/navigation's useRouter for its row action; the
// dashboard uses none. Provide both hooks as no-ops (no App Router in jsdom).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
}))

import { BookingsTable } from '@/app/bookings/bookings-table'
import { DashboardOverview } from '@/app/dashboard-overview'

expect.extend(toHaveNoViolations)

// A successful `{ success, data, meta? }` envelope, as returned by every admin
// API route.
function ok(data: unknown, meta?: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, meta }),
  } as Response
}

// Route the stubbed fetch by URL to the empty-but-valid shape each component
// expects so the render path reaches its settled (empty) state.
function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input)
  if (url.includes('/api/bookings')) {
    return Promise.resolve(ok({ bookings: [] }))
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

describe('Redesigned routes accessibility (Req 13.1)', () => {
  it('dashboard (/) has zero violations once settled', async () => {
    const { container } = render(<DashboardOverview />)

    // Wait for the async data to settle into the empty state.
    expect(await screen.findByText('No bookings yet.')).toBeInTheDocument()

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('bookings (/bookings) has zero violations once settled', async () => {
    const { container } = render(<BookingsTable />)

    expect(await screen.findByText('No bookings found')).toBeInTheDocument()

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
