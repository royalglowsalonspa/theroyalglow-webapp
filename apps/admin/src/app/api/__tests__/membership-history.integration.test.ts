// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { istToday } from '@rgss/business'
import { db } from '@rgss/db'
import { getInvoicingSetting } from '@rgss/db/queries'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as getInvoice } from '../billing/[id]/route'
import { POST as recordVisit } from '../memberships/[id]/sessions/retrospective/route'
import { POST as correctMinutes } from '../memberships/corrections/route'
import { POST as sellMembership } from '../memberships/route'

const requestContext = vi.hoisted(() => ({ branchId: '', userId: '' }))

// The test drives the actual branch authorization and route/database handlers.
// Only the framework's request state, authenticated identity and outbound job are fixtures.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: requestContext.branchId }) }),
}))
vi.mock('@/lib/api/session', () => ({
  requireSession: async () => ({ user: { id: requestContext.userId } }),
}))
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: vi.fn() }))

const SELLING_BRANCH = 'rehearsal_mb_a'
const DELIVERING_BRANCH = 'rehearsal_mb_b'
const DEVELOPER = 'rehearsal_mb_developer'
const RECEPTIONIST = 'rehearsal_mb_b_receptionist'
const TIER = 'rehearsal_mb_tier_restore'
const DAY_MS = 86_400_000

function assertDisposableDatabase(): string {
  const connection = URL.parse(process.env.DATABASE_URL ?? '')
  if (
    connection?.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(connection.hostname) ||
    connection.search ||
    !/^\/rgss_rehearsal_[a-z0-9_]+$/.test(connection.pathname)
  ) {
    throw new Error('Membership history requires a fresh loopback database named rgss_rehearsal_*')
  }

  return connection.pathname.slice(1)
}

function post(path: string, body: object): Request {
  return new Request(`https://admin.example.invalid${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readResponse(response: Response, status: number) {
  const body = await response.json()
  expect(response.status, JSON.stringify(body)).toBe(status)
  return body
}

// Issues invoices and records ledger entries only on the disposable SQL/Payload fixture.
describe.skipIf(process.env.ADMIN_REHEARSAL_MEMBERSHIP_HISTORY !== '1')(
  'retrospective membership billing (MS-11, TX-07, TX-12)',
  () => {
    afterEach(() => vi.useRealTimers())

    it('audits the omitted visit and a linked correction while preserving the original invoice', async () => {
      const target = assertDisposableDatabase()
      const {
        rows: [identity],
      } = await db.execute(sql`
        select current_database() as database, host(inet_server_addr()) as host
      `)
      expect(identity).toEqual({ database: target, host: '127.0.0.1' })
      expect(await getInvoicingSetting()).toEqual({ live: false })

      const {
        rows: [performer],
      } = await db.execute<{ staffId: string; serviceId: string }>(sql`
        select sp.id as "staffId", s.id as "serviceId"
        from staff_profile sp
        join staff_service ss on ss.staff_id = sp.id
        join service s on s.id = ss.service_id
        join service_category c on c.id = s.category_id
        where sp.branch_id = ${DELIVERING_BRANCH} and sp.user_id = 'rehearsal_mb_b_therapist'
          and sp.is_active and s.is_active and c.is_active and c.service_type = 'spa'
          and coalesce(s.sac_code, c.sac_code) = '999723'
        order by s.id limit 1
      `)
      if (!performer) throw new Error('Missing the delivering branch’s synthetic SPA fixture')

      const today = Date.now()
      const saleDay = istToday(new Date(today - 3 * DAY_MS))
      const visitDay = istToday(new Date(today - 2 * DAY_MS))
      const expiresOn = istToday(new Date(today - DAY_MS))
      const {
        rows: [slot],
      } = await db.execute<{ starts: number }>(sql`
        select hour as starts from generate_series(11, 17) hour
        where not exists (
          select from staff_work where staff_id = ${performer.staffId}
            and during && tstzrange(
              (${visitDay}::date + make_time(hour, 0, 0)) at time zone 'Asia/Kolkata',
              (${visitDay}::date + make_time(hour + 1, 0, 0)) at time zone 'Asia/Kolkata', '[)'
            )
        ) order by hour limit 1
      `)
      if (!slot) throw new Error('No unused historical hour in the synthetic fixture')

      const customerId = `rehearsal_ms11_${randomUUID()}`
      await db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${customerId}, 'Riya Rehearsal', ${`${customerId}@example.invalid`}, false, 'customer')
      `)

      requestContext.branchId = SELLING_BRANCH
      requestContext.userId = DEVELOPER
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(`${saleDay}T10:00:00+05:30`))
      const sale = await readResponse(
        await sellMembership(
          post('/api/memberships', {
            branchId: SELLING_BRANCH,
            customerId,
            tierId: TIER,
            hours: 10,
            pricePaise: 1_000_000,
            expiresOn,
            paymentMethod: 'upi',
          }),
          undefined,
        ),
        201,
      )
      vi.useRealTimers()
      const membershipId: unknown = sale.data.membership.id
      if (typeof membershipId !== 'string') throw new Error('Missing the issued membership ID')
      // Simulate the expiry job on the one synthetic membership sold above.
      await db.execute(sql`update spa_membership set status = 'expired' where id = ${membershipId}`)

      requestContext.branchId = DELIVERING_BRANCH
      const input = {
        branchId: DELIVERING_BRANCH,
        staffId: performer.staffId,
        actualStart: `${visitDay}T${slot.starts}:00:00+05:30`,
        actualEnd: `${visitDay}T${slot.starts + 1}:00:00+05:30`,
        reason: 'Reviewed the omitted appointment against the desk log',
        evidenceReference: 'Synthetic appointment log 17',
        idempotencyKey: randomUUID(),
        services: [{ serviceId: performer.serviceId, durationMinutes: 60 }],
      }
      const record = (changes = {}) =>
        recordVisit(
          post(`/api/memberships/${membershipId}/sessions/retrospective`, { ...input, ...changes }),
          {
            params: Promise.resolve({ id: membershipId }),
          },
        )

      await readResponse(await record({ evidenceReference: '' }), 400)
      const issued = await readResponse(await record(), 201)
      const bookingId: unknown = issued.data.booking.id
      const invoiceId: unknown = issued.data.invoice.id
      if (typeof bookingId !== 'string' || typeof invoiceId !== 'string') {
        throw new Error('Missing the issued session or invoice ID')
      }
      expect(issued.data).toMatchObject({
        booking: { status: 'completed', startedAt: new Date(input.actualStart).toISOString() },
        invoice: { id: invoiceId, invoiceType: 'membership_session', totalAmountPaise: 0 },
        remainingMinutes: 540,
        duplicate: false,
      })
      expect((await readResponse(await record(), 200)).data).toMatchObject({
        booking: { id: bookingId },
        invoice: { id: invoiceId },
        remainingMinutes: 540,
        duplicate: true,
      })
      await readResponse(await record({ idempotencyKey: randomUUID() }), 409)

      const readInvoice = () =>
        getInvoice(new Request(`https://admin.example.invalid/api/billing/${invoiceId}`), {
          params: Promise.resolve({ id: invoiceId }),
        })
      const original = (await readResponse(await readInvoice(), 200)).data.invoice
      expect(original.items).toEqual([
        expect.objectContaining({ sacCode: '999723', rateBps: 1800, taxPaise: 0 }),
      ])

      const correction = {
        branchId: DELIVERING_BRANCH,
        membershipId,
        bookingId,
        originalInvoiceId: invoiceId,
        idempotencyKey: randomUUID(),
        availableMinutesDelta: 15,
        reason: 'The signed service record shows only 45 minutes',
        evidenceReference: 'Synthetic signed service record 17',
      }
      const correct = (changes = {}) =>
        correctMinutes(
          post('/api/memberships/corrections', {
            ...correction,
            ...changes,
          }),
          undefined,
        )

      requestContext.userId = RECEPTIONIST
      await readResponse(await correct(), 403)
      requestContext.userId = DEVELOPER
      requestContext.branchId = SELLING_BRANCH
      await readResponse(await readInvoice(), 404)
      await readResponse(await correct({ branchId: SELLING_BRANCH }), 404)
      requestContext.branchId = DELIVERING_BRANCH
      const saved = await readResponse(await correct(), 201)
      expect(saved.data).toMatchObject({
        correction: {
          bookingId,
          originalInvoiceId: invoiceId,
          availableMinutesDelta: 15,
          performedBy: DEVELOPER,
        },
        remainingMinutes: 555,
        duplicate: false,
      })
      const replay = await readResponse(await correct(), 200)
      expect(replay.data).toEqual({ ...saved.data, duplicate: true })
      await readResponse(await correct({ availableMinutesDelta: 20 }), 409)

      const { data: after } = await readResponse(await readInvoice(), 200)
      expect(after.invoice).toEqual(original)
      expect(after.corrections).toEqual([saved.data.correction])

      const {
        rows: [minutes],
      } = await db.execute(sql`
        select m.used_hours_minutes as used, m.reserved_minutes as reserved, m.status,
               (select count(*)::int from booking where spa_membership_id = m.id) as sessions,
               (select minutes from membership_hold where booking_id = ${bookingId}) as consumed,
               (select count(*)::int from staff_occupancy where booking_id = ${bookingId}) as planned,
               (select count(*)::int from staff_work where booking_id = ${bookingId} and not upper_inf(during)) as actual
        from spa_membership m where m.id = ${membershipId}
      `)
      expect(minutes).toEqual({
        used: 45,
        reserved: 0,
        status: 'expired',
        sessions: 1,
        consumed: 60,
        planned: 0,
        actual: 1,
      })

      const { rows: audit } = await db.execute(sql`
        select entity_type, new_values->>'evidenceReference' as evidence
        from audit_log where actor_id = ${DEVELOPER} and branch_id = ${DELIVERING_BRANCH}
          and entity_id in (${bookingId}, ${saved.data.correction.id})
        order by entity_type
      `)
      expect(audit).toEqual([
        { entity_type: 'historical_membership_session', evidence: input.evidenceReference },
        { entity_type: 'membership_correction', evidence: correction.evidenceReference },
      ])

      const { rows: settlement } = await db.execute(sql`
        select kind, minutes, value_paise, gst_share_paise, amount_owed_paise
        from settlement_entry where booking_id = ${bookingId} and owing_branch_id = ${SELLING_BRANCH}
          and owed_branch_id = ${DELIVERING_BRANCH} order by minutes desc
      `)
      expect(settlement).toEqual([
        {
          kind: 'membership_session',
          minutes: 60,
          value_paise: '100000',
          gst_share_paise: '4761',
          amount_owed_paise: '95239',
        },
        {
          kind: 'membership_correction',
          minutes: -15,
          value_paise: '-25000',
          gst_share_paise: '-1190',
          amount_owed_paise: '-23810',
        },
      ])
    }, 30_000)
  },
)
