// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { istToday, startOfDayIST, versionInForce } from '@rgss/business'
import { db } from '@rgss/db'
import {
  createBookingWithServices,
  getBranchByIdAdmin,
  getBranchTaxVersions,
  getInvoicingSetting,
} from '@rgss/db/queries'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { branchContext } from '@/test/branch-context'
import { POST as completeBooking } from '../bookings/[id]/complete/route'
import { POST as sellMembership } from '../memberships/route'
import { POST as saveTaxVersion } from '../tax-versions/route'

const { requireBranchRole } = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

vi.mock('@/lib/api/branch-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/branch-context')>()),
  requireBranchRole,
}))
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: vi.fn() }))
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: vi.fn() }))

const BRANCH_A = 'rehearsal_mb_a'
const BRANCH_B = 'rehearsal_mb_b'
const DEVELOPER = 'rehearsal_mb_developer'
const TIER = 'rehearsal_mb_tier_restore'
const SAC = '999723'
const CHECKOUT_PRICE = 105_000
const MEMBERSHIP_PRICE = 1_000_000
const DAY_MS = 86_400_000

function assertDisposableDatabase(): string {
  const target = URL.parse(process.env.DATABASE_URL ?? '')
  if (
    !target ||
    !['postgresql:', 'postgres:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    !/^\/rgss_rehearsal_[a-z0-9_]+$/.test(target.pathname)
  ) {
    throw new Error('TX-03 requires a fresh loopback database named rgss_rehearsal_*')
  }
  return target.pathname.slice(1)
}

function post(path: string, body: object): Request {
  return new Request(`https://admin.example.invalid${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function expectResponse(response: Response, status: number): Promise<void> {
  const body = await response.json()
  expect(response.status, JSON.stringify(body)).toBe(status)
  expect(body).toMatchObject({ success: true })
}

async function fixturesAt(id: string) {
  const b = await getBranchByIdAdmin(id)
  if (b?.status !== 'operational') {
    throw new Error(`Missing operational synthetic branch ${id}`)
  }
  const {
    rows: [performer],
  } = await db.execute<{
    staffId: string
    serviceId: string
    serviceName: string
  }>(sql`
    select sp.id as "staffId", s.id as "serviceId", s.name as "serviceName"
    from staff_profile sp
    join staff_service ss on ss.staff_id = sp.id
    join service s on s.id = ss.service_id
    join service_category c on c.id = s.category_id
    where sp.branch_id = ${id} and sp.role_witness = 'staff'
      and sp.is_active and sp.designation = 'therapist' and s.is_active and c.is_active
      and c.service_type = 'spa' and coalesce(s.sac_code, c.sac_code) = ${SAC}
      and service_available_at(s.id, ${id})
    order by sp.id, s.id limit 1
  `)
  if (!performer) throw new Error(`Missing an assigned synthetic SPA service at ${id}`)

  return {
    branch: { id, name: b.name, code: b.code, status: b.status, isPrimary: b.isPrimary },
    performer,
  }
}

async function issueInvoices(
  { branch, performer }: Awaited<ReturnType<typeof fixturesAt>>,
  day: string,
  expiresOn: string,
) {
  const customerId = `rehearsal_tx03_${randomUUID()}`
  await db.execute(sql`
    insert into "user" (id, name, email, email_verified, role)
    values (${customerId}, 'Riya Rehearsal', ${`${customerId}@example.invalid`}, false, 'customer')
  `)
  const booking = await createBookingWithServices(
    {
      bookingNumber: `TX03-${customerId}`,
      customerId,
      branchId: branch.id,
      status: 'confirmed',
      serviceType: 'spa',
      bookingDate: new Date(`${day}T00:00:00.000Z`),
      startTime: '11:00',
      endTime: '11:30',
      totalDurationMinutes: 30,
      totalAmountPaise: CHECKOUT_PRICE,
    },
    [
      {
        serviceId: performer.serviceId,
        staffId: performer.staffId,
        serviceNameSnapshot: performer.serviceName,
        durationMinutes: 30,
        priceAtBookingPaise: CHECKOUT_PRICE,
        displayOrder: 0,
      },
    ],
  )
  requireBranchRole.mockResolvedValue(
    branchContext({ branch, userId: `${branch.id}_receptionist`, role: 'receptionist' }),
  )

  await expectResponse(
    await completeBooking(
      post(`/api/bookings/${booking.id}/complete`, {
        branchId: branch.id,
        paymentMethod: 'upi',
      }),
      { params: Promise.resolve({ id: booking.id }) },
    ),
    200,
  )
  await expectResponse(
    await sellMembership(
      post('/api/memberships', {
        branchId: branch.id,
        customerId,
        tierId: TIER,
        hours: 10,
        pricePaise: MEMBERSHIP_PRICE,
        expiresOn,
        paymentMethod: 'upi',
      }),
    ),
    201,
  )
  const { rows } = await db.execute(sql`
    select i.branch_id, i.invoice_type, i.total_amount_paise, i.taxable_value_paise,
           i.gst_amount_paise, i.cgst_paise, i.sgst_paise, i.tax_review_status,
           ii.tax_version_id, ii.rate_bps, ii.sac_code
    from invoice i join invoice_item ii on ii.invoice_id = i.id
    where i.customer_id = ${customerId}
    order by i.total_amount_paise
  `)
  return rows
}

// This issues real invoice numbers on the dummy branches. Run at most once on
// a fresh rehearsal database, then retain the redacted evidence and discard it.
describe.skipIf(process.env.ADMIN_REHEARSAL_TAX !== '1')('branch tax invoicing (TX-03)', () => {
  afterEach(() => vi.useRealTimers())

  it('applies the saved rate to checkout and membership sales only at the edited branch', async () => {
    const database = assertDisposableDatabase()
    const {
      rows: [identity],
    } = await db.execute(sql`select current_database() as database`)
    expect(identity?.database).toBe(database)
    expect(await getInvoicingSetting()).toEqual({ live: false })
    const [branchA, branchB] = await Promise.all([fixturesAt(BRANCH_A), fixturesAt(BRANCH_B)])

    const current = new Date()
    const effectiveDay = istToday(new Date(current.getTime() + DAY_MS))
    const nextDay = startOfDayIST(effectiveDay)
    const expiresOn = istToday(new Date(nextDay.getTime() + 90 * DAY_MS))
    const [ratesA, ratesB] = await Promise.all([
      getBranchTaxVersions(BRANCH_A),
      getBranchTaxVersions(BRANCH_B),
    ])
    expect(versionInForce(ratesA, BRANCH_A, SAC, current)?.rateBps).toBe(500)
    const comparison = versionInForce(ratesB, BRANCH_B, SAC, current)
    expect(comparison?.rateBps).toBe(1800)

    requireBranchRole.mockResolvedValue(
      branchContext({ branch: branchA.branch, userId: DEVELOPER, role: 'developer' }),
    )
    const saved = await saveTaxVersion(
      post('/api/tax-versions', {
        branchId: BRANCH_A,
        sacCode: SAC,
        rateBps: 1200,
        effectiveFrom: effectiveDay,
        reason: 'Synthetic branch comparison during the TX-03 rehearsal',
      }),
    )
    await expectResponse(saved, 201)
    const reloaded = await getBranchTaxVersions(BRANCH_A)
    expect(versionInForce(reloaded, BRANCH_A, SAC, current)?.rateBps).toBe(500)
    const futureRate = versionInForce(reloaded, BRANCH_A, SAC, nextDay)
    expect(futureRate).toMatchObject({
      rateBps: 1200,
      effectiveFrom: nextDay,
      reviewStatus: 'provisional',
    })

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(nextDay.getTime() + 12 * 60 * 60 * 1000))

    const atEditedBranch = await issueInvoices(branchA, effectiveDay, expiresOn)
    const atOtherBranch = await issueInvoices(branchB, effectiveDay, expiresOn)
    const forBranch = (branchId: string, version: typeof futureRate, rate: number) => ({
      branch_id: branchId,
      tax_version_id: version?.id,
      rate_bps: rate,
      sac_code: SAC,
      tax_review_status: 'provisional',
    })
    const checkout = (taxable: number, gst: number, cgst: number, sgst: number) => ({
      invoice_type: 'service',
      total_amount_paise: CHECKOUT_PRICE,
      taxable_value_paise: taxable,
      gst_amount_paise: gst,
      cgst_paise: cgst,
      sgst_paise: sgst,
    })
    const membership = (taxable: number, gst: number, cgst: number, sgst: number) => ({
      invoice_type: 'membership_purchase',
      total_amount_paise: MEMBERSHIP_PRICE,
      taxable_value_paise: taxable,
      gst_amount_paise: gst,
      cgst_paise: cgst,
      sgst_paise: sgst,
    })
    expect(atEditedBranch).toEqual([
      { ...forBranch(BRANCH_A, futureRate, 1200), ...checkout(93_750, 11_250, 5_625, 5_625) },
      { ...forBranch(BRANCH_A, futureRate, 1200), ...membership(892_857, 107_143, 53_571, 53_572) },
    ])
    expect(atOtherBranch).toEqual([
      { ...forBranch(BRANCH_B, comparison, 1800), ...checkout(88_983, 16_017, 8_008, 8_009) },
      { ...forBranch(BRANCH_B, comparison, 1800), ...membership(847_458, 152_542, 76_271, 76_271) },
    ])
  }, 30_000)
})
