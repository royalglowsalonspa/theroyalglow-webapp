// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : booking-lead-integration.test
 * Scope        : Integration tests — booking + lead happy paths
 *
 * Description  : Exercises the customer booking-create and lead-capture routes
 *                end to end through their real business layer, with only the
 *                query layer and session/job side-effects faked:
 *                  (a) POST /api/bookings — a valid submission yields a `pending`
 *                      booking with an id and a structured booking number, and
 *                      writes a snapshot row per selected service with the
 *                      service's name and price frozen (Req 5.2 / 5.7).
 *                  (b) POST /api/leads — a valid submission yields a `new` lead
 *                      with the returned id, phone normalised to +91 form and
 *                      source defaulted to `meta_ad` (Req 9.1).
 *
 * Approach     : route → @rgss/business (REAL) → @rgss/db/queries (in-memory
 *                fakes). `@/lib/api/session` is mocked to supply a signed-in
 *                customer for the booking route, and `@/lib/jobs/enqueue` is a
 *                no-op so best-effort job scheduling never touches the network.
 *                The rate limiter and phone normaliser stay REAL.
 *
 * Layer        : Testing
 *
 * Notes        : Runs in the `node` environment (server route handlers).
 *                Validates: Requirements 5.2, 9.1
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock seams. `@rgss/business` is intentionally NOT mocked — the booking total,
// booking-number, slot-bookability and phone-normalisation logic run for real.
// ---------------------------------------------------------------------------
const sessionMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
  requireRole: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  // booking create flow
  getBranchById: vi.fn(),
  getServicesByIds: vi.fn(),
  getDefaultStaffForService: vi.fn(),
  createBookingWithServices: vi.fn(),
  getBookingsByCustomer: vi.fn(),
  // lead create flow
  createLead: vi.fn(),
}))

const enqueueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: enqueueMock }))

import { POST as bookingsPOST } from '@/app/api/bookings/route'
import { POST as leadsPOST } from '@/app/api/leads/route'

const CUSTOMER_SESSION = { user: { id: 'cust_1', role: 'customer' } }

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireSession.mockResolvedValue(CUSTOMER_SESSION)
  enqueueMock.mockResolvedValue(undefined)
})

// ===========================================================================
// (a) POST /api/bookings — happy path
//     Validates: Requirements 5.2 (pending booking with id + number, snapshots)
// ===========================================================================
describe('POST /api/bookings — happy path', () => {
  it('creates a pending booking with id + booking number and snapshots each service', async () => {
    // Two active salon services. Their current name + price are what must be
    // frozen onto the booking_service snapshot rows.
    const services = [
      {
        id: 'svc_haircut',
        categoryId: 'cat_hair',
        categoryName: 'Hair',
        serviceType: 'salon' as const,
        name: 'Signature Haircut',
        slug: 'signature-haircut',
        durationMinutes: 30,
        pricePaise: 50_000,
        isActive: true,
        gemsRedeemable: false,
        gemsRequired: null,
      },
      {
        id: 'svc_blowdry',
        categoryId: 'cat_hair',
        categoryName: 'Hair',
        serviceType: 'salon' as const,
        name: 'Blow Dry',
        slug: 'blow-dry',
        durationMinutes: 30,
        pricePaise: 30_000,
        isActive: true,
        gemsRedeemable: false,
        gemsRequired: null,
      },
    ]

    dbMocks.getBranchById.mockResolvedValue({
      id: 'branch_rs',
      code: 'RS',
      status: 'operational',
    })
    dbMocks.getServicesByIds.mockResolvedValue(services)
    dbMocks.getDefaultStaffForService.mockResolvedValue('staff_1')

    // In-memory fake: echo back a created booking row, capturing the snapshot
    // rows so the test can assert what was written atomically.
    let captured: { booking: Record<string, unknown>; serviceRows: unknown[] } | null = null
    dbMocks.createBookingWithServices.mockImplementation(
      async (bookingData: Record<string, unknown>, serviceRows: unknown[]) => {
        captured = { booking: bookingData, serviceRows }
        return {
          id: 'bk_generated_1',
          bookingNumber: bookingData.bookingNumber,
          status: bookingData.status,
        }
      },
    )

    const res = await bookingsPOST(
      jsonRequest('https://theroyalglow.in/api/bookings', {
        branchId: 'branch_rs',
        serviceType: 'salon',
        bookingDate: '2026-07-01',
        startTime: '10:00',
        serviceIds: ['svc_haircut', 'svc_blowdry'],
      }),
      { params: Promise.resolve({}) } as never,
    )
    const body = await res.json()

    // Response: 201 + standard success envelope with id, booking number, status.
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('bk_generated_1')
    expect(body.data.status).toBe('pending')
    // Booking number is the structured salon format BK-{code}-{YYMM}-H-{5 digits}.
    expect(body.data.bookingNumber).toMatch(/^BK-RS-2607-H-\d{5}$/)

    // The booking was persisted exactly once, as `pending`, with totals summed
    // from the selected services (integer paise + minutes).
    expect(dbMocks.createBookingWithServices).toHaveBeenCalledOnce()
    expect(captured).not.toBeNull()
    const saved = captured as unknown as {
      booking: Record<string, unknown>
      serviceRows: Array<Record<string, unknown>>
    }
    expect(saved.booking.status).toBe('pending')
    expect(saved.booking.totalAmountPaise).toBe(80_000)
    expect(saved.booking.totalDurationMinutes).toBe(60)
    expect(saved.booking.customerId).toBe('cust_1')

    // One snapshot row per selected service, with the name + price frozen from
    // the source service (Req 5.7).
    expect(saved.serviceRows).toHaveLength(2)
    expect(saved.serviceRows).toEqual([
      expect.objectContaining({
        serviceId: 'svc_haircut',
        serviceNameSnapshot: 'Signature Haircut',
        priceAtBookingPaise: 50_000,
      }),
      expect.objectContaining({
        serviceId: 'svc_blowdry',
        serviceNameSnapshot: 'Blow Dry',
        priceAtBookingPaise: 30_000,
      }),
    ])
  })
})

// ===========================================================================
// (b) POST /api/leads — happy path
//     Validates: Requirements 9.1 (new lead with returned id)
// ===========================================================================
describe('POST /api/leads — happy path', () => {
  it('creates a `new` lead and returns its id, normalising phone + defaulting source', async () => {
    // In-memory fake mirroring the real query: status defaults to `new`.
    let createdLead: Record<string, unknown> | null = null
    dbMocks.createLead.mockImplementation(async (data: Record<string, unknown>) => {
      createdLead = { id: 'lead_generated_1', status: data.status ?? 'new', ...data }
      return createdLead
    })

    const res = await leadsPOST(
      jsonRequest('https://theroyalglow.in/api/leads', {
        name: 'Asha Rao',
        phone: '9876543210',
        utmSource: 'meta',
        utmMedium: 'paid_social',
        utmCampaign: 'monsoon',
      }),
      { params: Promise.resolve({}) } as never,
    )
    const body = await res.json()

    // Response: 201 + the created lead id in the standard envelope.
    expect(res.status).toBe(201)
    expect(body).toEqual({ success: true, data: { leadId: 'lead_generated_1' } })

    // The lead was created once: phone normalised to +91 form, source defaulted
    // to `meta_ad`, UTM attribution preserved, and status `new`.
    expect(dbMocks.createLead).toHaveBeenCalledOnce()
    expect(dbMocks.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Asha Rao',
        phone: '+919876543210',
        source: 'meta_ad',
        utmSource: 'meta',
        utmMedium: 'paid_social',
        utmCampaign: 'monsoon',
      }),
    )
    expect(createdLead).not.toBeNull()
    expect((createdLead as unknown as { status: string }).status).toBe('new')
  })
})
