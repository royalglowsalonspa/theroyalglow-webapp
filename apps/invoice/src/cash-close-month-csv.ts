import { type CashCloseMonthRow, readCashCloseMonth } from './cash-close-month-data'
import { snapshotHash } from './contracts'
import type { InvoiceEnv } from './env'
import { csvCell, csvFile } from './register-csv'

const schemaVersion = 1
const columns = [
  'schema_version',
  'branch_id',
  'business_month_ist',
  'business_date_ist',
  'source_observed_at_utc',
  'close_revision',
  'approval_status',
  'collections_status',
  'recorded_service_cash_paise',
  'draft_service_cash_paise',
  'expected_cash_paise',
  'counted_cash_paise',
  'variance_paise',
  'deposit_paise',
  'bank_credit_paise',
  'bank_credit_revision',
  'bank_credit_status',
] as const

function collectionsStatus(row: CashCloseMonthRow) {
  if (row.serviceCashPaise === null) return 'unavailable'
  if (row.revision === null) return 'uncompared'
  if (row.sourceCurrent) return 'current'
  return row.serviceCashPaise === row.draftServiceCashPaise ? 'older' : 'changed'
}

function bankCreditStatus(row: CashCloseMonthRow) {
  if (row.depositsPaise === null) return 'unavailable'
  if (row.bankCreditPaise !== null)
    return row.bankCreditPaise === row.depositsPaise ? 'linked' : 'amount_differs'
  if (row.depositsPaise === 0) return 'no_deposit'
  return row.approved ? 'awaiting_credit' : 'awaiting_approval'
}

export async function downloadCashCloseMonth(
  env: InvoiceEnv,
  email: string,
  branch: string,
  month: string,
  lastClosedDay: string,
): Promise<Response> {
  const report = await readCashCloseMonth(env, email, branch, month, lastClosedDay)
  if (!report) return new Response(null, { status: 404 })

  const csv = [columns.join(',')]
  for (const row of report.rows) {
    const record: Record<(typeof columns)[number], string | number | null> = {
      schema_version: schemaVersion,
      branch_id: branch,
      business_month_ist: month,
      business_date_ist: row.day,
      source_observed_at_utc: report.sourceObservedAt,
      close_revision: row.revision,
      approval_status:
        row.revision === null ? 'no_draft' : row.approved ? 'approved' : 'awaiting_approval',
      collections_status: collectionsStatus(row),
      recorded_service_cash_paise: row.serviceCashPaise,
      draft_service_cash_paise: row.draftServiceCashPaise,
      expected_cash_paise: row.expectedPaise,
      counted_cash_paise: row.countedPaise,
      variance_paise: row.variancePaise,
      deposit_paise: row.depositsPaise,
      bank_credit_paise: row.bankCreditPaise,
      bank_credit_revision: row.bankCreditRevision,
      bank_credit_status: bankCreditStatus(row),
    }
    const cells = columns.map((column) => record[column])
    if (cells.some((value) => typeof value === 'number' && !Number.isSafeInteger(value))) {
      return new Response('Amounts or revisions exceed the supported export range.', {
        status: 422,
      })
    }
    csv.push(cells.map(csvCell).join(','))
  }

  const file = csvFile(csv)
  const id = crypto.randomUUID()
  const audit = await env.DB.prepare(`
    INSERT INTO invoice_cash_close_month_export
      (id, actor_email, source, branch_id, month, generated_at, source_observed_at, row_count, schema_version, sha256)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
    WHERE EXISTS (
      SELECT 1 FROM invoice_effective_grant WHERE email = ?2 AND branch_id = ?4
        AND role IN ('owner', 'manager', 'accountant')
    )
  `)
    .bind(
      id,
      email,
      env.BILLING_SOURCE,
      branch,
      month,
      Date.now(),
      report.sourceObservedAt === null ? null : Date.parse(report.sourceObservedAt),
      report.rows.length,
      schemaVersion,
      await snapshotHash(file),
    )
    .run()
  if (audit.meta.changes !== 1) return new Response(null, { status: 404 })

  return new Response(file, {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cash-close-${month}-${branch}.csv"`,
      'x-invoice-report-id': id,
      'x-invoice-report-month': month,
    },
  })
}
