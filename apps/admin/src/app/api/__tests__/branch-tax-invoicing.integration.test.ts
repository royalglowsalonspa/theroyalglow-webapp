// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { istToday, startOfDayIST, versionInForce } from '@rgss/business'
import { db } from '@rgss/db'
import {
  createBookingWithServices,
  getBranchByIdAdmin,
  getBranchTaxVersions,
  getInvoiceForPdf,
  getInvoicingSetting,
  getServiceSacCodes,
} from '@rgss/db/queries'
import { sql } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildPdfPayload } from '@/lib/invoices/pdf-payload'
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
const BRANCH_C = 'rehearsal_mb_c'
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
    throw new Error('The tax rehearsal requires a fresh loopback database named rgss_rehearsal_*')
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
    serviceSac: string | null
    categoryId: string
    categorySac: string | null
  }>(sql`
    select sp.id as "staffId", s.id as "serviceId", s.name as "serviceName",
           s.sac_code as "serviceSac", c.id as "categoryId", c.sac_code as "categorySac"
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
    issuer: { gstin: b.gstin, legalName: b.legalName, addressLine1: b.addressLine1 },
  }
}

async function createCheckoutFixture(
  { branch, performer }: Awaited<ReturnType<typeof fixturesAt>>,
  day: string,
) {
  const customerId = `rehearsal_tax_${randomUUID()}`
  await db.execute(sql`
    insert into "user" (id, name, email, email_verified, role)
    values (${customerId}, 'Riya Rehearsal', ${`${customerId}@example.invalid`}, false, 'customer')
  `)
  const booking = await createBookingWithServices(
    {
      bookingNumber: `TAX-${customerId}`,
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
  return { bookingId: booking.id, customerId }
}

function checkout(bookingId: string, branchId: string): Promise<Response> {
  return completeBooking(
    post(`/api/bookings/${bookingId}/complete`, { branchId, paymentMethod: 'upi' }),
    { params: Promise.resolve({ id: bookingId }) },
  )
}

function membershipSale(
  branchId: string,
  customerId: string,
  expiresOn: string,
): Promise<Response> {
  return sellMembership(
    post('/api/memberships', {
      branchId,
      customerId,
      tierId: TIER,
      hours: 10,
      pricePaise: MEMBERSHIP_PRICE,
      expiresOn,
      paymentMethod: 'upi',
    }),
  )
}

async function issueInvoices(
  fixture: Awaited<ReturnType<typeof fixturesAt>>,
  day: string,
  expiresOn: string,
) {
  const branchId = fixture.branch.id
  const { bookingId, customerId } = await createCheckoutFixture(fixture, day)
  await expectResponse(await checkout(bookingId, branchId), 200)
  await expectResponse(await membershipSale(branchId, customerId, expiresOn), 201)
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
describe.skipIf(process.env.ADMIN_REHEARSAL_TAX !== '1')('branch tax invoicing', () => {
  beforeAll(async () => {
    const database = assertDisposableDatabase()
    const {
      rows: [identity],
    } = await db.execute(sql`select current_database() as database`)
    expect(identity?.database).toBe(database)
    expect(await getInvoicingSetting()).toEqual({ live: false })
  })
  afterEach(() => vi.useRealTimers())

  it('applies the saved rate to checkout and membership sales only at the edited branch', async () => {
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

  it('rebuilds the issued tax and issuer facts after the branch and catalogue change (TX-05)', async () => {
    const fixture = await fixturesAt(BRANCH_A)
    const issueDay = istToday(new Date(Date.now() + 7 * DAY_MS))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(startOfDayIST(issueDay).getTime() + DAY_MS / 2))
    const { bookingId } = await createCheckoutFixture(fixture, issueDay)
    await expectResponse(await checkout(bookingId, BRANCH_A), 200)

    const {
      rows: [invoice],
    } = await db.execute<{ id: string }>(
      sql`select id from invoice where booking_id = ${bookingId}`,
    )
    if (!invoice) throw new Error('The fixture checkout did not issue an invoice')
    const loadPayload = async () => {
      const loaded = await getInvoiceForPdf(invoice.id)
      if (!loaded) throw new Error('The issued invoice is missing from the PDF loader')
      return buildPdfPayload(loaded)
    }
    const before = await loadPayload()
    expect(before.seller).toMatchObject({
      name: fixture.branch.name,
      legalName: fixture.issuer.legalName,
      gstin: fixture.issuer.gstin,
    })
    expect(before.items[0]?.sacCode).toBe(SAC)

    const changedSac = '999722'
    const effectiveDay = istToday(new Date(Date.now() + DAY_MS))
    requireBranchRole.mockResolvedValue(
      branchContext({ branch: fixture.branch, userId: DEVELOPER, role: 'developer' }),
    )
    await expectResponse(
      await saveTaxVersion(
        post('/api/tax-versions', {
          branchId: BRANCH_A,
          sacCode: changedSac,
          rateBps: 2600,
          effectiveFrom: effectiveDay,
          reason: 'Synthetic change after issuing the original invoice',
        }),
      ),
      201,
    )
    try {
      await db.batch([
        db.execute(sql`
          update branch set name = 'Rayasandra Spa Annex (Rehearsal)',
            legal_name = 'Rehearsal Annex LLP', gstin = '29ZZZZZ0064Z1Z0',
            address_line1 = 'Suite 7, Example Arcade' where id = ${BRANCH_A}
        `),
        db.execute(sql`
          update service set sac_code = ${changedSac} where id = ${fixture.performer.serviceId}
        `),
      ])
      vi.setSystemTime(startOfDayIST(effectiveDay))
      expect((await getBranchByIdAdmin(BRANCH_A))?.name).toBe('Rayasandra Spa Annex (Rehearsal)')
      expect(
        (await getServiceSacCodes([fixture.performer.serviceId])).get(fixture.performer.serviceId),
      ).toBe(changedSac)
      const rates = await getBranchTaxVersions(BRANCH_A)
      expect(versionInForce(rates, BRANCH_A, changedSac, new Date())?.rateBps).toBe(2600)
      expect(await loadPayload()).toEqual(before)
    } finally {
      await db.batch([
        db.execute(sql`
          update branch set name = ${fixture.branch.name}, legal_name = ${fixture.issuer.legalName},
            gstin = ${fixture.issuer.gstin}, address_line1 = ${fixture.issuer.addressLine1}
          where id = ${BRANCH_A}
        `),
        db.execute(sql`
          update service set sac_code = ${fixture.performer.serviceSac}
          where id = ${fixture.performer.serviceId}
        `),
      ])
    }
  }, 30_000)

  it('blocks live-mode issuance and leaves the invoice sequence untouched (TX-08)', async () => {
    const fixture = await fixturesAt(BRANCH_C)
    const { performer, issuer } = fixture
    const today = new Date(`${istToday()}T00:00:00.000Z`)
    const daysUntilSaturday = (6 - today.getUTCDay() + 7) % 7 || 7
    const day = istToday(new Date(today.getTime() + daysUntilSaturday * DAY_MS))
    const expiresOn = istToday(new Date(today.getTime() + 90 * DAY_MS))
    const { bookingId, customerId } = await createCheckoutFixture(fixture, day)
    const expectBlocked = async (response: Response, message: RegExp) => {
      const body = await response.json()
      expect(response.status, JSON.stringify(body)).toBe(409)
      expect(body).toMatchObject({
        success: false,
        error: { code: 'TAX_CONFIGURATION_INCOMPLETE', message: expect.stringMatching(message) },
      })
    }
    await db.execute(sql`update system_setting set value = '{"live":true}' where key = 'invoicing'`)
    try {
      await expectBlocked(await checkout(bookingId, BRANCH_C), /reviewed tax rates/)
      await expectBlocked(
        await membershipSale(BRANCH_C, customerId, expiresOn),
        /reviewed tax rates/,
      )

      await db.execute(sql`
        update branch_tax_version set review_status = 'reviewed', reviewed_at = now(),
          reviewed_by = ${DEVELOPER} where id = ${`rehearsal_mb_tax_c_${SAC}`}
      `)
      await db.execute(sql`update branch set gstin = null where id = ${BRANCH_C}`)
      await expectBlocked(await checkout(bookingId, BRANCH_C), /GSTIN/)
      await expectBlocked(await membershipSale(BRANCH_C, customerId, expiresOn), /GSTIN/)

      await db.execute(sql`update branch set gstin = ${issuer.gstin} where id = ${BRANCH_C}`)
      await db.batch([
        db.execute(sql`update service set sac_code = null where id = ${performer.serviceId}`),
        db.execute(
          sql`update service_category set sac_code = null where id = ${performer.categoryId}`,
        ),
      ])
      await expectBlocked(await checkout(bookingId, BRANCH_C), /no tax classification/)

      const { rows } = await db.execute(sql`
        select (select status from booking where id = ${bookingId}) as status,
          (select count(*)::int from invoice_sequence where branch_id = ${BRANCH_C}) as sequences,
          (select count(*)::int from invoice where branch_id = ${BRANCH_C}) as invoices,
          (select count(*)::int from spa_membership where customer_id = ${customerId}) as memberships
      `)
      expect(rows).toEqual([{ status: 'confirmed', sequences: 0, invoices: 0, memberships: 0 }])
    } finally {
      await db.batch([
        db.execute(sql`update system_setting set value = '{"live":false}' where key = 'invoicing'`),
        db.execute(sql`update branch set gstin = ${issuer.gstin} where id = ${BRANCH_C}`),
        db.execute(
          sql`update service set sac_code = ${performer.serviceSac} where id = ${performer.serviceId}`,
        ),
        db.execute(
          sql`update service_category set sac_code = ${performer.categorySac} where id = ${performer.categoryId}`,
        ),
      ])
    }
  }, 30_000)
})
