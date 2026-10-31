/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice-issue.integration.test
 * Scope        : Integration test — issuing invoices and branch tax rates (REAL db)
 *
 * Description  : Against Neon dev, with the 0017 checks and 0018 triggers and
 *                three throwaway branches (multi-branch R6.1, R6.2, R6.4, R6.5):
 *                  - issues at one branch take consecutive numbers, even when
 *                    they run at once; another branch counts on its own;
 *                  - an issue that rolls back uses up no number;
 *                  - a line must use the branch's rate in force for its SAC
 *                    code at the tax point; an invoice must carry its
 *                    snapshot, and its amounts must add up;
 *                  - an issued invoice's facts and lines can't change, while
 *                    its payment details can;
 *                  - a booking is billed once;
 *                  - a branch's prefix is fixed once it has issued;
 *                  - a new branch gets provisional copies of the primary
 *                    branch's rates in force; a rate in force can't change or
 *                    be deleted, and its review is recorded once;
 *                  - the monthly GST summary sums the stored lines per branch,
 *                    issuer GSTIN and SAC code, and a rebuild drops an invoice
 *                    that is no longer paid.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `inv_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven. The branches reuse the
 *                primary branch's Owner. The GST summary rebuild replaces the
 *                current month's rows for every branch with the same values
 *                (derived data); the suite's rows go with its branches.
 ************************************************************/

import { sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { fixtureFinancialYear, splitFixtureTax } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { createBookingWithServices } from './bookings'
import {
  type InvoiceIssue,
  type InvoiceIssueLine,
  isDuplicateBookingInvoice,
  issueInvoiceStatements,
} from './invoice-issue'
import { buildMonthlyGstSummary } from './jobs'
import { branchHasIssuedInvoices, createTaxVersion, markTaxVersionReviewed } from './tax'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `inv_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const BRANCH_C = `${PREFIX}_c`
const CUSTOMER = `${PREFIX}_customer`
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

let prefixA = ''
let serviceId = ''
// 00:00 IST on the day the suite's branches were created.
let createdDayStart = new Date(0)

/** 'YYYY-MM-DD' of an instant on the IST calendar. */
function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Every message down the error's cause chain (Drizzle wraps the Postgres error). */
async function failure(write: PromiseLike<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    const messages: string[] = []
    let current: unknown = error
    for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
      messages.push(current.message)
      current = (current as { cause?: unknown }).cause
    }
    return messages.join(' | ')
  }
  return 'no error'
}

/** The branch's version in force now for the SAC code. */
async function inForce(branchId: string, sacCode: string) {
  const version = await queryRow<{ id: string; rate_bps: number }>(sql`
    select id, rate_bps from branch_tax_version
     where branch_id = ${branchId} and sac_code = ${sacCode} and effective_from <= now()
     order by effective_from desc
     limit 1`)
  if (!version) {
    throw new Error(`${branchId} has no rate in force for ${sacCode}`)
  }
  return version
}

type Line = { amountPaise: number; sacCode: string; override?: Partial<InvoiceIssueLine> }

/** An invoice issued the way checkout issues one, every line at its rate in force. */
async function issueOf(params: {
  id: string
  branchId: string
  bookingId?: string | null
  lines: Line[]
  header?: Partial<InvoiceIssue>
}) {
  const lines: InvoiceIssueLine[] = []
  for (const [index, line] of params.lines.entries()) {
    const version = await inForce(params.branchId, line.sacCode)
    const split = splitFixtureTax(line.amountPaise, version.rate_bps)
    lines.push({
      serviceId: null,
      serviceNameSnapshot: `ZZ IT line ${index}`,
      staffNameSnapshot: null,
      quantity: 1,
      unitPricePaise: line.amountPaise,
      totalPricePaise: line.amountPaise,
      displayOrder: index,
      sacCode: line.sacCode,
      taxVersionId: version.id,
      rateBps: version.rate_bps,
      discountPaise: 0,
      taxableValuePaise: split.taxablePaise,
      taxPaise: split.taxPaise,
      cgstPaise: split.cgstPaise,
      sgstPaise: split.sgstPaise,
      ...line.override,
    })
  }
  const sum = (pick: (line: InvoiceIssueLine) => number) =>
    lines.reduce((total, line) => total + pick(line), 0)
  const taxPointAt = new Date()
  const issue: InvoiceIssue = {
    id: params.id,
    branchId: params.branchId,
    bookingId: params.bookingId ?? null,
    customerId: CUSTOMER,
    invoiceType: 'service',
    paymentMethod: 'cash',
    subtotalPaise: sum((l) => l.totalPricePaise),
    discountAmountPaise: 0,
    taxableValuePaise: sum((l) => l.taxableValuePaise),
    gstAmountPaise: sum((l) => l.taxPaise),
    cgstPaise: sum((l) => l.cgstPaise),
    sgstPaise: sum((l) => l.sgstPaise),
    totalAmountPaise: sum((l) => l.totalPricePaise),
    gemsEarned: 0,
    taxPointAt,
    financialYear: fixtureFinancialYear(taxPointAt),
    taxReviewStatus: 'provisional',
    ...params.header,
  }
  return issueInvoiceStatements(issue, lines)
}

/** Issue it in one transaction, with any extra statements after it. */
async function issue(
  params: Parameters<typeof issueOf>[0],
  ...extra: BatchItem<'pg'>[]
): Promise<unknown[]> {
  const { counter, insertInvoice, insertLines } = await issueOf(params)
  const statements: BatchItem<'pg'>[] = [counter, insertInvoice]
  if (insertLines) {
    statements.push(insertLines)
  }
  statements.push(...extra)
  return db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
}

async function counterOf(branchId: string): Promise<number | null> {
  const row = await queryRow<{ last_number: number }>(sql`
    select last_number from invoice_sequence
     where branch_id = ${branchId} and financial_year = ${fixtureFinancialYear(new Date())}`)
  return row ? Number(row.last_number) : null
}

describe.skipIf(!LIVE)('issuing invoices against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9400 + Math.floor(Math.random() * 90)
    createdDayStart = new Date(`${istDate(new Date())}T00:00:00+05:30`)

    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${CUSTOMER}, 'ZZ Inv IT customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Inv IT A', 'Test', '560100', '0000000000', 990, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Inv IT B', 'Test', '560100', '0000000000', 991, ${owner?.id ?? ''}),
               (${BRANCH_C}, ${number + 2}, ${`${PREFIX}_C`}, 'ZZ Inv IT C', 'Test', '560100', '0000000000', 992, ${owner?.id ?? ''})`),
    ])
    const prefix = await queryRow<{ invoice_prefix: string }>(
      sql`select invoice_prefix from branch where id = ${BRANCH_A}`,
    )
    prefixA = prefix?.invoice_prefix ?? ''
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(
        sql`delete from invoice_item where invoice_id in (select id from invoice where branch_id like ${like})`,
      ),
      db.execute(sql`delete from invoice where branch_id like ${like}`),
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from monthly_gst_summary where branch_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from invoice where branch_id like ${like}) as invoices,
               (select count(*) from invoice_sequence where branch_id like ${like}) as counters,
               (select count(*) from branch_tax_version where branch_id like ${like}) as versions,
               (select count(*) from monthly_gst_summary where branch_id like ${like}) as summaries,
               (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      invoices: '0',
      counters: '0',
      versions: '0',
      summaries: '0',
      bookings: '0',
      branches: '0',
      users: '0',
    })
  })

  it('gives a new branch provisional copies of the primary branch’s rates in force', async () => {
    const primary = await queryRows<{ sac_code: string; rate_bps: number }>(sql`
      select distinct on (v.sac_code) v.sac_code, v.rate_bps
        from branch_tax_version v
       where v.branch_id = (select id from branch where is_primary and id not like ${`${PREFIX}%`}
                             order by display_order, id limit 1)
         and v.effective_from <= now()
       order by v.sac_code, v.effective_from desc`)
    const copies = await queryRows<{
      sac_code: string
      rate_bps: number
      review_status: string
      starts_on_creation_day: boolean
      reason: string
    }>(sql`
      select sac_code, rate_bps, review_status, reason,
             effective_from = ${createdDayStart} as starts_on_creation_day
        from branch_tax_version where branch_id = ${BRANCH_C} order by sac_code`)

    expect(primary.length).toBeGreaterThan(0)
    expect(copies.map((c) => [c.sac_code, Number(c.rate_bps)])).toEqual(
      primary.map((p) => [p.sac_code, Number(p.rate_bps)]),
    )
    for (const copy of copies) {
      expect(copy.review_status).toBe('provisional')
      expect(copy.starts_on_creation_day).toBe(true)
      expect(copy.reason).toMatch(/^Copied from /)
    }
    // Its default prefix is "B" and its number in base 36.
    expect(prefixA).toMatch(/^B[0-9A-Z]{1,3}$/)
  })

  it('numbers issues at one branch consecutively, even when they run at once', async () => {
    const ids = [1, 2, 3, 4, 5].map((n) => `${PREFIX}_seq${n}`)
    await Promise.all(
      ids.map((id, index) =>
        issue({
          id,
          branchId: BRANCH_A,
          lines: [{ amountPaise: 10_000 + index, sacCode: '999721' }],
        }),
      ),
    )
    await issue({
      id: `${PREFIX}_other`,
      branchId: BRANCH_B,
      lines: [{ amountPaise: 10_000, sacCode: '999721' }],
    })

    const fy = fixtureFinancialYear(new Date())
    const atA = await queryRows<{ sequence_number: number; invoice_number: string }>(sql`
      select sequence_number, invoice_number from invoice
       where branch_id = ${BRANCH_A} order by sequence_number`)
    expect(atA.map((r) => Number(r.sequence_number))).toEqual([1, 2, 3, 4, 5])
    expect(atA.map((r) => r.invoice_number)).toEqual(
      [1, 2, 3, 4, 5].map((n) => `${prefixA}/${fy}/00000${n}`),
    )
    expect(await counterOf(BRANCH_A)).toBe(5)
    // Another branch counts on its own.
    expect(await counterOf(BRANCH_B)).toBe(1)
    expect(await branchHasIssuedInvoices(BRANCH_A)).toBe(true)
  })

  it('stores the issuer as issued and each line’s tax facts', async () => {
    const stored = await queryRow<Record<string, unknown>>(sql`
      select i.issuer_name, i.issuer_address, i.issuer_state, i.issuer_gstin, i.tax_review_status,
             i.financial_year, i.payment_status, i.paid_at = i.tax_point_at as paid_at_tax_point,
             ii.sac_code, ii.rate_bps, ii.taxable_value_paise + ii.tax_paise as net,
             ii.cgst_paise + ii.sgst_paise = ii.tax_paise as split_adds_up
        from invoice i join invoice_item ii on ii.invoice_id = i.id
       where i.id = ${`${PREFIX}_seq1`}`)
    expect(stored).toMatchObject({
      issuer_name: 'ZZ Inv IT A',
      issuer_address: 'Test\nBengaluru, Karnataka 560100',
      issuer_state: 'Karnataka',
      issuer_gstin: null,
      tax_review_status: 'provisional',
      financial_year: fixtureFinancialYear(new Date()),
      payment_status: 'paid',
      paid_at_tax_point: true,
      sac_code: '999721',
      split_adds_up: true,
    })
    expect(Number(stored?.net)).toBe(10_000)
  })

  it('uses up no number when the issue rolls back', async () => {
    const message = await failure(
      issue(
        {
          id: `${PREFIX}_rolled`,
          branchId: BRANCH_A,
          lines: [{ amountPaise: 5_000, sacCode: '999721' }],
        },
        db.execute(sql`select 1 / 0`),
      ),
    )
    expect(message).toMatch(/division by zero/)
    expect(await counterOf(BRANCH_A)).toBe(5)
    expect(await queryRow(sql`select id from invoice where id = ${`${PREFIX}_rolled`}`)).toBeNull()

    await issue({
      id: `${PREFIX}_seq6`,
      branchId: BRANCH_A,
      lines: [{ amountPaise: 5_000, sacCode: '999721' }],
    })
    expect(
      await queryRow(sql`select sequence_number from invoice where id = ${`${PREFIX}_seq6`}`),
    ).toEqual({ sequence_number: 6 })
  })

  it('refuses a line that does not use the branch’s rate in force', async () => {
    const otherBranch = await inForce(BRANCH_B, '999721')
    const scheduled = await createTaxVersion({
      branchId: BRANCH_A,
      sacCode: '999722',
      rateBps: 1800,
      effectiveFrom: new Date(createdDayStart.getTime() + 2 * DAY_MS),
      reason: 'ZZ IT scheduled rate',
      createdBy: CUSTOMER,
    })

    const cases: Partial<InvoiceIssueLine>[] = [
      { rateBps: 1800 },
      { taxVersionId: otherBranch.id },
      { sacCode: '999722', taxVersionId: scheduled.id, rateBps: 1800 },
    ]
    for (const [index, override] of cases.entries()) {
      const message = await failure(
        issue({
          id: `${PREFIX}_bad${index}`,
          branchId: BRANCH_A,
          lines: [{ amountPaise: 10_000, sacCode: '999721', override }],
        }),
      )
      expect(message).toMatch(/does not use the rate in force/)
    }
    expect(
      await failure(
        issue({
          id: `${PREFIX}_noversion`,
          branchId: BRANCH_A,
          lines: [
            {
              amountPaise: 10_000,
              sacCode: '999721',
              override: { taxVersionId: null as unknown as string },
            },
          ],
        }),
      ),
    ).toMatch(/has no tax version/)
    // None of them took a number.
    expect(await counterOf(BRANCH_A)).toBe(6)

    // A rate not yet in force may still be withdrawn.
    await db.execute(sql`delete from branch_tax_version where id = ${scheduled.id}`)
    expect(
      await queryRow(sql`select id from branch_tax_version where id = ${scheduled.id}`),
    ).toBeNull()
  })

  it('refuses an invoice without its snapshot, or whose amounts don’t add up', async () => {
    expect(
      await failure(
        db.execute(sql`
          insert into invoice (id, invoice_number, branch_id, customer_id, subtotal_paise, total_amount_paise)
          values (${`${PREFIX}_bare`}, ${`ZZ${RUN}BARE`}, ${BRANCH_A}, ${CUSTOMER}, 100, 100)`),
      ),
    ).toMatch(/is missing its issue snapshot/)

    expect(
      await failure(
        issue({
          id: `${PREFIX}_unbalanced`,
          branchId: BRANCH_A,
          lines: [{ amountPaise: 10_000, sacCode: '999721' }],
          header: { cgstPaise: 1, sgstPaise: 1 },
        }),
      ),
    ).toMatch(/invoice_snapshot_check/)
    expect(await counterOf(BRANCH_A)).toBe(6)
  })

  it('keeps an issued invoice’s facts and lines, but records its payment details', async () => {
    const id = `${PREFIX}_seq1`
    expect(
      await failure(
        db.execute(
          sql`update invoice set total_amount_paise = total_amount_paise + 1 where id = ${id}`,
        ),
      ),
    ).toMatch(/is issued; its facts can't change/)
    expect(
      await failure(
        db.execute(sql`update invoice set issuer_gstin = '29ABCDE1234F1Z5' where id = ${id}`),
      ),
    ).toMatch(/is issued; its facts can't change/)
    expect(
      await failure(
        db.execute(
          sql`update invoice_item set service_name_snapshot = 'x' where invoice_id = ${id}`,
        ),
      ),
    ).toMatch(/belongs to an issued invoice/)

    await db.execute(sql`
      update invoice
         set payment_method = 'card', pdf_url = 'https://example.invalid/zz.pdf', notes = 'ZZ IT'
       where id = ${id}`)
    expect(
      await queryRow(sql`select payment_method, pdf_url, notes from invoice where id = ${id}`),
    ).toEqual({ payment_method: 'card', pdf_url: 'https://example.invalid/zz.pdf', notes: 'ZZ IT' })
  })

  it('bills a booking once', async () => {
    const booking = await createBookingWithServices(
      {
        bookingNumber: `${PREFIX}_bk`,
        branchId: BRANCH_A,
        customerId: CUSTOMER,
        status: 'pending',
        serviceType: 'salon',
        bookingDate: new Date('2099-06-01T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
        totalAmountPaise: 10_000,
        totalDurationMinutes: 30,
      },
      [
        {
          serviceId,
          staffId: null,
          serviceNameSnapshot: 'ZZ IT service',
          priceAtBookingPaise: 10_000,
          durationMinutes: 30,
          displayOrder: 0,
        },
      ],
    )
    await issue({
      id: `${PREFIX}_billed`,
      branchId: BRANCH_A,
      bookingId: booking.id,
      lines: [{ amountPaise: 10_000, sacCode: '999721' }],
    })

    let duplicate: unknown = null
    try {
      await issue({
        id: `${PREFIX}_billed_again`,
        branchId: BRANCH_A,
        bookingId: booking.id,
        lines: [{ amountPaise: 10_000, sacCode: '999721' }],
      })
    } catch (error) {
      duplicate = error
    }
    expect(isDuplicateBookingInvoice(duplicate)).toBe(true)
    expect(await counterOf(BRANCH_A)).toBe(7)
  })

  it('fixes a branch’s prefix once it has issued', async () => {
    const fresh = `Z${RUN.slice(0, 3).toUpperCase()}`
    expect(
      await failure(
        db.execute(sql`update branch set invoice_prefix = ${fresh} where id = ${BRANCH_A}`),
      ),
    ).toMatch(/has issued invoices, so its invoice prefix .* is fixed/)

    expect(await branchHasIssuedInvoices(BRANCH_C)).toBe(false)
    await db.execute(sql`update branch set invoice_prefix = ${fresh} where id = ${BRANCH_C}`)
    expect(await queryRow(sql`select invoice_prefix from branch where id = ${BRANCH_C}`)).toEqual({
      invoice_prefix: fresh,
    })
  })

  it('keeps a rate in force as it is, and records its review once', async () => {
    const version = await inForce(BRANCH_A, '999721')
    expect(
      await failure(
        db.execute(
          sql`update branch_tax_version set rate_bps = rate_bps + 100 where id = ${version.id}`,
        ),
      ),
    ).toMatch(/can't change; add a new rate instead/)
    expect(
      await failure(db.execute(sql`delete from branch_tax_version where id = ${version.id}`)),
    ).toMatch(/is in force and can't be deleted/)

    const reviewed = await markTaxVersionReviewed(version.id, BRANCH_A, CUSTOMER)
    expect(reviewed).toMatchObject({
      id: version.id,
      reviewStatus: 'reviewed',
      reviewedBy: CUSTOMER,
    })
    expect(await markTaxVersionReviewed(version.id, BRANCH_A, CUSTOMER)).toBeNull()
    // Another branch can't review it.
    expect(await markTaxVersionReviewed(version.id, BRANCH_B, CUSTOMER)).toBeNull()
    expect(
      await failure(
        db.execute(sql`
          update branch_tax_version set review_status = 'provisional', reviewed_at = null
           where id = ${version.id}`),
      ),
    ).toMatch(/is already reviewed/)
  })

  it('sums the month’s stored lines per branch, GSTIN and SAC code, and drops an unpaid one', async () => {
    // At B: one invoice under two codes, one under 999722 only (plus B's
    // first invoice above, under 999721).
    await issue({
      id: `${PREFIX}_gst1`,
      branchId: BRANCH_B,
      lines: [
        { amountPaise: 100_000, sacCode: '999721' },
        { amountPaise: 50_000, sacCode: '999722' },
      ],
    })
    await issue({
      id: `${PREFIX}_gst2`,
      branchId: BRANCH_B,
      lines: [{ amountPaise: 30_000, sacCode: '999722' }],
    })
    const rate721 = (await inForce(BRANCH_B, '999721')).rate_bps
    const rate722 = (await inForce(BRANCH_B, '999722')).rate_bps
    const split = (amount: number, rate: number) => splitFixtureTax(amount, rate)
    const month = istDate(new Date()).slice(0, 7)
    const rowsOfB = async () =>
      (await buildMonthlyGstSummary(month)).filter((row) => row.branchId === BRANCH_B)

    const first = await rowsOfB()
    const hair = [split(10_000, rate721), split(100_000, rate721)]
    const care = [split(50_000, rate722), split(30_000, rate722)]
    const total = (parts: ReturnType<typeof split>[], key: keyof ReturnType<typeof split>) =>
      parts.reduce((sum, part) => sum + part[key], 0)
    expect(first.map((r) => [r.sacCode, r.invoiceCount])).toEqual([
      ['999721', 2],
      ['999722', 2],
    ])
    expect(first[0]).toMatchObject({
      month,
      issuerGstin: null,
      taxableValuePaise: total(hair, 'taxablePaise'),
      gstAmountPaise: total(hair, 'taxPaise'),
      cgstPaise: total(hair, 'cgstPaise'),
      sgstPaise: total(hair, 'sgstPaise'),
    })
    expect(first[1]).toMatchObject({
      taxableValuePaise: total(care, 'taxablePaise'),
      gstAmountPaise: total(care, 'taxPaise'),
    })

    // A rebuild gives the same rows, ids included; only their creation time moves.
    const withoutCreatedAt = (rows: typeof first) => rows.map(({ createdAt: _at, ...row }) => row)
    expect(withoutCreatedAt(await rowsOfB())).toEqual(withoutCreatedAt(first))

    // An invoice that is no longer paid drops out of the month.
    await db.execute(
      sql`update invoice set payment_status = 'refunded' where id = ${`${PREFIX}_gst2`}`,
    )
    const after = await rowsOfB()
    expect(after.map((r) => [r.sacCode, r.invoiceCount])).toEqual([
      ['999721', 2],
      ['999722', 1],
    ])
    expect(after[1]?.taxableValuePaise).toBe(split(50_000, rate722).taxablePaise)
  })
})
