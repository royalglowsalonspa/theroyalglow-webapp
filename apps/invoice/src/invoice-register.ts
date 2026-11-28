import { DurableObject } from 'cloudflare:workers'
import { istToday, monthKeyIST } from '@rgss/business'
import { INVOICE_ORIGINAL_ARCHIVE_PATH } from '@rgss/types'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { developerEmail } from './auth'
import { invoiceId } from './contracts'
import type { InvoiceEnv, PortalEnv } from './env'
import { renderGstReview } from './gst-review'
import { readGstSummary } from './gst-summary'
import {
  invoiceRegisterStatement,
  type RegisterRow,
  renderInvoiceRegister,
} from './invoice-register-data'
import { buildLineTaxRegister, type LineTaxDateRange } from './line-tax-register'
import {
  addMonthlyCloseReview,
  type CloseReviewInput,
  type closeDownload,
  compareMonthlyClose,
  downloadMonthlyClose,
  readMonthlyCloseGstinEvidence,
  saveMonthlyClose,
} from './monthly-close'
import { archiveOriginal, downloadArchivedOriginal } from './original-archive'
import { reconcileBranch } from './reconciliation'

const SCHEMA_VERSION = 1
type RegisterKind = 'invoice' | 'line_tax'
const filters = z.object({
  month: z
    .string()
    .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  branch: invoiceId.optional(),
})
const lineTaxRange = z.object({ from: z.iso.date(), through: z.iso.date() })
export const invoiceRegisterRoutes = new Hono<PortalEnv>()

async function showReport(c: Context<PortalEnv>, kind: RegisterKind | 'gst'): Promise<Response> {
  const email = c.get('email')
  if (email === developerEmail(c.env)) return c.text('This account manages access only.', 403)
  const selection = filters.safeParse({
    month: c.req.query('month'),
    branch: c.req.query('branch') || undefined,
  })
  if (!selection.success) return c.text('Choose a valid month and branch.', 400)
  const { month = kind === 'gst' ? monthKeyIST() : istToday().slice(0, 7), branch } = selection.data
  const { from, through } = c.req.query()
  let range: LineTaxDateRange | undefined
  if (from !== undefined || through !== undefined) {
    const dates = lineTaxRange.safeParse({ from, through })
    if (
      kind !== 'line_tax' ||
      !dates.success ||
      !dates.data.from.startsWith(`${month}-`) ||
      !dates.data.through.startsWith(`${month}-`) ||
      dates.data.from > dates.data.through
    ) {
      return c.text(
        'Choose a start and end date within the selected month for the line-tax CSV.',
        400,
      )
    }
    range = dates.data
  }
  const register = c.env.REGISTER.getByName(email)
  if (kind === 'gst') return register.gstReview(email, month, branch)
  return register.download(email, month, branch, kind, range)
}

invoiceRegisterRoutes.get('/invoices.csv', (c) => showReport(c, 'invoice'))
invoiceRegisterRoutes.get('/line-tax.csv', (c) => showReport(c, 'line_tax'))
invoiceRegisterRoutes.get('/gst', (c) => showReport(c, 'gst'))

export class InvoiceRegister extends DurableObject<InvoiceEnv> {
  async fetch(request: Request): Promise<Response> {
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === INVOICE_ORIGINAL_ARCHIVE_PATH
    )
      return archiveOriginal(request, this.env)
    return new Response(null, { status: 404 })
  }

  async downloadArchivedOriginal(email: string, id: string): Promise<Response> {
    return downloadArchivedOriginal(this.env, email, id)
  }

  async addMonthlyCloseReview(
    email: string,
    branch: string,
    id: string,
    input: CloseReviewInput,
  ): Promise<Response> {
    return addMonthlyCloseReview(this.env, email, branch, id, input)
  }

  async compareMonthlyClose(
    email: string,
    branch: string,
    id: string,
    page: number,
  ): Promise<Response> {
    return compareMonthlyClose(this.env, email, branch, id, page)
  }

  async readMonthlyCloseGstinEvidence(email: string, branch: string, id: string, gstin: string) {
    return readMonthlyCloseGstinEvidence(this.env, email, branch, id, gstin)
  }

  async reconcileBranch(month: string, branch: string): Promise<Response> {
    return reconcileBranch(this.env, month, branch)
  }

  async saveMonthlyClose(
    email: string,
    branch: string,
    month: string,
    id: string,
  ): Promise<Response> {
    return saveMonthlyClose(this.env, email, branch, month, id)
  }

  async downloadMonthlyClose(
    email: string,
    branch: string,
    id: string,
    file: z.infer<typeof closeDownload>,
  ): Promise<Response> {
    return downloadMonthlyClose(this.env, email, branch, id, file)
  }

  async gstReview(email: string, month: string, branch?: string): Promise<Response> {
    const denied = () => new Response(null, { status: branch ? 404 : 403 })
    if (!(await this.#readable(email, branch ? [branch] : []))) return denied()
    const summary = await readGstSummary(this.env.DB, email, month, branch)
    const branches = branch ? [branch] : summary instanceof Response ? [] : summary.branches
    if (!(await this.#readable(email, branches))) return denied()
    return renderGstReview(summary, month, branch)
  }

  async #readable(email: string, branches: string[]) {
    return this.env.DB.prepare(`
      SELECT 1 WHERE EXISTS (SELECT 1 FROM invoice_effective_grant WHERE email = ?1)
        AND NOT EXISTS (SELECT 1 FROM json_each(?2) selected
          WHERE NOT EXISTS (SELECT 1 FROM invoice_effective_grant g
            WHERE g.email = ?1 AND g.branch_id = selected.value))
    `)
      .bind(email, JSON.stringify(branches))
      .first()
  }

  async download(
    email: string,
    month: string,
    branch: string | undefined,
    kind: RegisterKind,
    range?: LineTaxDateRange,
  ): Promise<Response> {
    const grant = await this.#readable(email, branch ? [branch] : [])
    if (!grant) return new Response(null, { status: branch ? 404 : 403 })

    const report =
      kind === 'line_tax'
        ? await buildLineTaxRegister(this.env.DB, email, month, branch, range)
        : renderInvoiceRegister(
            (await invoiceRegisterStatement(this.env.DB, email, month, branch).all<RegisterRow>())
              .results,
            branch,
          )
    if (report instanceof Response) return report

    const id = crypto.randomUUID()
    const audit = await this.env.DB.prepare(`
      INSERT INTO invoice_register_export (id, actor_email, source, month, branch_id, generated_at,
        latest_received_at, invoice_count, missing_facts_count, total_paise, schema_version,
        report_kind, line_count, incomplete_line_count, range_from, range_through)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?16, ?17
      WHERE EXISTS (SELECT 1 FROM invoice_effective_grant WHERE email = ?2)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?15) exported
          WHERE NOT EXISTS (SELECT 1 FROM invoice_effective_grant g
            WHERE g.email = ?2 AND g.branch_id = exported.value)
        )
    `)
      .bind(
        id,
        email,
        this.env.BILLING_SOURCE,
        month,
        branch ?? null,
        Date.now(),
        report.latestReceivedAt,
        report.invoiceCount,
        report.missingFacts,
        report.totalPaise,
        SCHEMA_VERSION,
        kind,
        report.lineCount,
        report.incompleteLineCount,
        JSON.stringify(branch ? [branch] : report.branches),
        range?.from ?? null,
        range?.through ?? null,
      )
      .run()
    if (!audit.meta.changes) return new Response(null, { status: branch ? 404 : 403 })
    const suffix = branch ? `-${branch}` : ''
    const dates = range ? `-${range.from}_to_${range.through}` : ''
    const filename = kind === 'line_tax' ? 'line-tax-register' : 'invoice-register'
    return new Response(report.file, {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}-${month}${suffix}${dates}.csv"`,
        'x-invoice-report-id': id,
        'x-invoice-report-month': month,
      },
    })
  }
}
