// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : bookings/list-projection.test
 * Scope        : Unit test — GET /api/bookings (admin) listing projection
 *
 * Description  : Asserts the admin booking listing returns rows that carry the
 *                customer name, the booking's services (each with its assigned
 *                staff name), the assigned staff, and the booking status — the
 *                projection the admin bookings page renders.
 *
 * Approach     : `@/lib/api/session` (requireRole) and `@rgss/db/queries`
 *                (listBookings) are mocked with an in-memory fake so no real
 *                session or Neon connection is hit. `@rgss/business` is left
 *                REAL. The route handler is invoked directly and the success
 *                envelope is asserted field-by-field.
 *
 * Layer        : Testing (node environment — server route handler)
 *
 * Notes        : Validates: Requirements 10.2
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  listBookings: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET as bookingsGET } from '@/app/api/bookings/route'

const AUTHORIZED_SESSION = { user: { id: 'u_admin', role: 'receptionist' } }

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(AUTHORIZED_SESSION)
})

// A representative cross-customer projection as produced by listBookings: each
// booking row carries the owning customer's name, the booking status, and its
// booking_service rows — each of which carries the assigned staff member's name
// (null when the booking is still pending and unassigned).
const PROJECTION = [
  {
    id: 'bk_1',
    customerId: 'cust_1',
    customerName: 'Asha Rao',
    customerEmail: 'asha@example.com',
    status: 'confirmed',
    serviceType: 'salon',
    services: [
      {
        id: 'bs_1',
        bookingId: 'bk_1',
        serviceId: 'svc_1',
        serviceNameSnapshot: 'Hair Spa',
        staffId: 'stf_1',
        staffName: 'Priya Menon',
        priceAtBookingPaise: 150000,
        displayOrder: 0,
      },
    ],
  },
  {
    id: 'bk_2',
    customerId: 'cust_2',
    customerName: 'Vikram Shah',
    customerEmail: 'vikram@example.com',
    status: 'pending',
    serviceType: 'spa',
    services: [
      {
        id: 'bs_2',
        bookingId: 'bk_2',
        serviceId: 'svc_2',
        serviceNameSnapshot: 'Aroma Massage',
        staffId: null,
        staffName: null,
        priceAtBookingPaise: 300000,
        displayOrder: 0,
      },
    ],
  },
]

describe('GET /api/bookings (admin) — listing projection (Req 10.2)', () => {
  it('returns rows carrying customer name, services, assigned staff, and status', async () => {
    dbMocks.listBookings.mockResolvedValue(PROJECTION)

    const res = await bookingsGET(new Request('https://admin.theroyalglow.in/api/bookings'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.bookings)).toBe(true)
    expect(body.data.bookings).toHaveLength(2)

    for (const row of body.data.bookings) {
      // Customer name is present on every row (Req 10.2 — across all customers).
      expect(typeof row.customerName).toBe('string')
      expect(row.customerName.length).toBeGreaterThan(0)
      // Status is present.
      expect(typeof row.status).toBe('string')
      // Services are present and each carries the assigned-staff projection
      // (staffName — possibly null when unassigned).
      expect(Array.isArray(row.services)).toBe(true)
      expect(row.services.length).toBeGreaterThan(0)
      for (const svc of row.services) {
        expect(svc).toHaveProperty('serviceNameSnapshot')
        expect(svc).toHaveProperty('staffId')
        expect(svc).toHaveProperty('staffName')
      }
    }

    // The assigned booking carries a concrete staff name; the pending one is null.
    const confirmed = body.data.bookings.find((b: { id: string }) => b.id === 'bk_1')
    const pending = body.data.bookings.find((b: { id: string }) => b.id === 'bk_2')
    expect(confirmed.services[0].staffName).toBe('Priya Menon')
    expect(confirmed.status).toBe('confirmed')
    expect(pending.services[0].staffName).toBeNull()
    expect(pending.status).toBe('pending')
  })

  it('forwards the supplied status/serviceType/date filters to listBookings', async () => {
    dbMocks.listBookings.mockResolvedValue([])

    await bookingsGET(
      new Request(
        'https://admin.theroyalglow.in/api/bookings?status=pending&serviceType=spa&date=2026-06-04',
      ),
    )

    expect(dbMocks.listBookings).toHaveBeenCalledWith({
      status: 'pending',
      serviceType: 'spa',
      date: '2026-06-04',
    })
  })
})
