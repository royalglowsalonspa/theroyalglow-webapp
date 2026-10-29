/************************************************************
 * Module Name  : BookingDetail (component test)
 * Scope        : Admin Portal — Booking detail (multi-branch R1.7)
 *
 * Description  : A confirmed booking whose assignee was taken off it says
 *                why, shows nobody assigned and holds checkout until
 *                reception assigns someone, with the rendered branch. An
 *                assigned booking names its staff and offers a change only
 *                once someone else is picked. No accessibility violations.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { BookingDetail } from './booking-detail'

expect.extend(toHaveNoViolations)

const STAFF = [
  { id: 'st_asha', name: 'Asha', designation: 'stylist' },
  { id: 'st_ravi', name: 'Ravi', designation: 'stylist' },
]

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'bk_1',
  branchId: 'rs',
  bookingNumber: 'BK-RS-2611-H-12345',
  status: 'confirmed',
  serviceType: 'salon',
  bookingDate: '2026-11-05',
  startTime: '15:00',
  endTime: '16:00',
  totalAmountPaise: 150_000,
  customerName: 'Kavya',
  customerEmail: 'kavya@example.com',
  notes: null,
  services: [
    {
      id: 'bs_1',
      serviceNameSnapshot: 'Haircut',
      priceAtBookingPaise: 150_000,
      durationMinutes: 60,
      staffId: 'st_asha',
      staffName: 'Asha',
    },
  ],
  reassignment: null,
  ...overrides,
})

const UNASSIGNED = booking({
  services: [
    {
      id: 'bs_1',
      serviceNameSnapshot: 'Haircut',
      priceAtBookingPaise: 150_000,
      durationMinutes: 60,
      staffId: null,
      staffName: null,
    },
  ],
  reassignment: {
    reason: 'left_branch',
    previousStaffName: 'Meena',
    since: '2026-11-01T10:00:00.000Z',
  },
})

type Call = { url: string; init: RequestInit | undefined }
let calls: Call[] = []
let current: ReturnType<typeof booking> = booking()

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 })
}

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === '/api/staff') {
        return ok({ branchId: 'rs', staff: STAFF })
      }
      if (init?.method === 'PATCH') {
        return ok({ bookingId: 'bk_1', services: [] })
      }
      return ok({ booking: current })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const patches = () => calls.filter((c) => c.init?.method === 'PATCH')
const reads = () => calls.filter((c) => c.url === '/api/bookings/bk_1' && !c.init?.method)

async function pick(label: string, option: string) {
  fireEvent.keyDown(await screen.findByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('BookingDetail — reassignment (R1.7)', () => {
  it('says why it needs someone else and holds checkout until someone is assigned', async () => {
    current = UNASSIGNED
    const { container } = render(<BookingDetail bookingId="bk_1" />)

    expect(
      await screen.findByRole('heading', { name: 'This booking needs someone else' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Meena no longer works at this branch\./)).toBeInTheDocument()
    expect(screen.getByText('Not assigned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete & Checkout' })).toBeDisabled()
    expect(
      screen.getByText('Assign who is doing this booking before completing it.'),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()

    await pick('Assign staff', 'Ravi (stylist)')
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    const [patch] = patches()
    expect(patch?.url).toBe('/api/bookings/bk_1')
    expect(JSON.parse(String(patch?.init?.body ?? '{}'))).toEqual({
      action: 'assign',
      branchId: 'rs',
      staffId: 'st_ravi',
    })
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Ravi assigned'))
    // Reloaded to show the new assignee.
    await waitFor(() => expect(reads()).toHaveLength(2))
  })

  it('names the assignee and offers a change only for someone else', async () => {
    current = booking()
    render(<BookingDetail bookingId="bk_1" />)

    expect(await screen.findByText('Asha')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'This booking needs someone else' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Complete & Checkout' })).toBeEnabled()
    const change = screen.getByRole('button', { name: 'Change staff' })
    expect(change).toBeDisabled()

    await pick('Assigned staff', 'Ravi (stylist)')
    expect(change).toBeEnabled()
  })

  it('keeps a refused assignment on the page', async () => {
    current = UNASSIGNED
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (url === '/api/staff') {
          return ok({ branchId: 'rs', staff: STAFF })
        }
        if (init?.method === 'PATCH') {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'CONFLICT',
                message: 'That staff member is on approved leave that day. Choose someone else.',
                statusCode: 409,
              },
            }),
            { status: 409 },
          )
        }
        return ok({ booking: current })
      }),
    )
    render(<BookingDetail bookingId="bk_1" />)

    await pick('Assign staff', 'Ravi (stylist)')
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    expect(await screen.findByText(/on approved leave that day/)).toBeInTheDocument()
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(reads()).toHaveLength(1)
  })
})
