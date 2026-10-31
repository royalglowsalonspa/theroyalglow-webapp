/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : issued-invoice (test support)
 * Scope        : Data Access — live-suite fixtures for issued invoices
 *
 * Description  : Since migration 0018 every new invoice carries its issue
 *                snapshot, and each of its lines the branch's tax version in
 *                force for the line's SAC code at the tax point. Live suites
 *                that seed invoices with plain SQL build them here, so a
 *                fixture passes the same guards a production write does.
 *
 * Responsibilities :
 * - issuedInvoiceStatements(fixture) → the invoice and its lines, taxed at the
 *   branch's version in force at the tax point, ready for db.batch
 * - splitFixtureTax(amount, rate) → taxable, tax, CGST, SGST of one line
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access (Test support)
 *
 * Dependencies : drizzle-orm, ../index, ./live-db
 *
 * Notes        : The split mirrors @rgss/business splitInclusive and
 *                splitIntraState (packages/db must not import business):
 *                taxable = round half up of amount × 10,000 / (10,000 + rate),
 *                CGST = floor(tax / 2). A branch created by a suite has the
 *                provisional copies 0018 gives a new branch, in force from
 *                00:00 IST on its creation day, so a fixture's tax point must
 *                be from then on unless the suite seeds an earlier version.
 ************************************************************/

import { type SQL, sql } from 'drizzle-orm'
import { db } from '../index'
import { queryRow } from './live-db'

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** A raw statement: awaitable alone, or batched with others. */
export type FixtureStatement = ReturnType<typeof db.execute>

export type FixtureLine = {
  name: string
  amountPaise: number
  serviceId?: string | null
  staffName?: string | null
}

export type FixtureInvoice = {
  id: string
  /** At most 16 characters (invoice_snapshot_check). */
  number: string
  /** Unique per branch and financial year. */
  sequence: number
  branchId: string
  customerId: string
  bookingId?: string | null
  invoiceType?: 'service' | 'membership_purchase' | 'membership_session'
  paymentStatus?: 'paid' | 'pending' | 'refunded'
  /** The moment of issue; also its paid_at (when paid) and created_at. */
  taxPointAt: Date
  /** The lines' SAC code; 999721 unless given. */
  sacCode?: string
  issuerGstin?: string | null
  lines: FixtureLine[]
}

/** One line's tax inside its tax-inclusive amount. */
export function splitFixtureTax(amountPaise: number, rateBps: number) {
  const divisor = 10_000 + rateBps
  const taxablePaise = Math.floor((amountPaise * 20_000 + divisor) / (2 * divisor))
  const taxPaise = amountPaise - taxablePaise
  const cgstPaise = Math.floor(taxPaise / 2)
  return { taxablePaise, taxPaise, cgstPaise, sgstPaise: taxPaise - cgstPaise }
}

/** "2627" for an instant from 1 April 2026 to 31 March 2027, on the IST calendar. */
export function fixtureFinancialYear(at: Date): string {
  const wall = new Date(at.getTime() + IST_OFFSET_MS)
  const start = wall.getUTCMonth() >= 3 ? wall.getUTCFullYear() : wall.getUTCFullYear() - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

/**
 * The statements that issue `fixture`: the invoice with its snapshot, then its
 * lines at the branch's version in force for the SAC code at the tax point.
 * Throws when the branch has no such version.
 */
export async function issuedInvoiceStatements(
  fixture: FixtureInvoice,
): Promise<[FixtureStatement, ...FixtureStatement[]]> {
  const sacCode = fixture.sacCode ?? '999721'
  const version = await queryRow<{ id: string; rate_bps: number }>(sql`
    select id, rate_bps from branch_tax_version
     where branch_id = ${fixture.branchId} and sac_code = ${sacCode}
       and effective_from <= ${fixture.taxPointAt}
     order by effective_from desc
     limit 1`)
  if (!version) {
    throw new Error(`${fixture.branchId} has no tax version for SAC ${sacCode} in force then`)
  }

  const lines = fixture.lines.map((line) => ({
    ...line,
    ...splitFixtureTax(line.amountPaise, version.rate_bps),
  }))
  const sum = (pick: (line: (typeof lines)[number]) => number) =>
    lines.reduce((total, line) => total + pick(line), 0)
  const status = fixture.paymentStatus ?? 'paid'

  // VALUES, so each bound value takes its column's type; the issuer is the
  // branch as it is now.
  const header = db.execute(sql`
    insert into invoice (id, invoice_number, branch_id, booking_id, customer_id, invoice_type,
                         subtotal_paise, discount_amount_paise, taxable_value_paise,
                         gst_amount_paise, cgst_paise, sgst_paise, total_amount_paise,
                         payment_status, paid_at, created_at, tax_point_at, financial_year,
                         sequence_number, tax_review_status, issuer_name, issuer_gstin,
                         issuer_address, issuer_state)
    values (${fixture.id}, ${fixture.number}, ${fixture.branchId}, ${fixture.bookingId ?? null},
            ${fixture.customerId}, ${fixture.invoiceType ?? 'service'},
            ${sum((l) => l.amountPaise)}, 0, ${sum((l) => l.taxablePaise)},
            ${sum((l) => l.taxPaise)}, ${sum((l) => l.cgstPaise)}, ${sum((l) => l.sgstPaise)},
            ${sum((l) => l.amountPaise)}, ${status},
            ${status === 'paid' ? fixture.taxPointAt : null}, ${fixture.taxPointAt},
            ${fixture.taxPointAt}, ${fixtureFinancialYear(fixture.taxPointAt)}, ${fixture.sequence},
            'provisional',
            (select name from branch where id = ${fixture.branchId}),
            ${fixture.issuerGstin ?? null},
            (select address_line1 from branch where id = ${fixture.branchId}),
            (select state from branch where id = ${fixture.branchId}))`)
  if (lines.length === 0) {
    return [header]
  }

  const rows: SQL[] = lines.map(
    (line, index) => sql`(${`${fixture.id}_i${index}`}, ${fixture.id}, ${line.serviceId ?? null},
      ${line.name}, ${line.staffName ?? null}, 1, ${line.amountPaise}, ${line.amountPaise},
      ${sacCode}, ${version.id}, ${version.rate_bps}, 0, ${line.taxablePaise}, ${line.taxPaise},
      ${line.cgstPaise}, ${line.sgstPaise}, ${index})`,
  )
  const items = db.execute(sql`
    insert into invoice_item (id, invoice_id, service_id, service_name_snapshot,
                              staff_name_snapshot, quantity, unit_price_paise, total_price_paise,
                              sac_code, tax_version_id, rate_bps, discount_paise,
                              taxable_value_paise, tax_paise, cgst_paise, sgst_paise,
                              display_order)
    values ${sql.join(rows, sql`, `)}`)
  return [header, items]
}
