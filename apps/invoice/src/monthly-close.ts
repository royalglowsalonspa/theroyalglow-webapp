import { istMonthBounds, istToday } from '@rgss/business'
import { invoiceCoverageIdentityText } from '@rgss/types'
import { z } from 'zod'
import { snapshotHash } from './contracts'
import type { InvoiceEnv } from './env'
import { type GstRow, gstSummaryStatement, summarizeGstRows } from './gst-summary'
import { readGstinDraftTotals } from './gstin-close-summary'
import { reviewInvoiceNumbering } from './invoice-numbering-review'
import {
  invoiceRegisterStatement,
  type RegisterRow,
  renderInvoiceRegister,
} from './invoice-register-data'
import {
  type LineTaxRow,
  lineTaxRegisterStatement,
  renderLineTaxRegister,
} from './line-tax-register'
import { type DraftSourceCheck, renderMonthlyCloseComparison } from './monthly-close-comparison'
import {
  type CloseRegisterInvoice,
  compareCloseRegisters,
  readCloseRegisterInvoices,
} from './monthly-close-diff'
import { recordMonthlyCloseReview } from './monthly-close-review-store'
import {
  auditMonthlyCloseDownload,
  type MonthlyCloseDraft,
  monthlyCloseBranchRole,
  readMonthlyCloseDraft,
  recordMonthlyCloseDraft,
} from './monthly-close-store'
import { readSourceCoverage } from './source-coverage'

// shortcut: bound draft size for the Worker, split the evidence into files if larger months need it.
const maxPackageBytes = 4 * 1024 * 1024
export const closeDownload = z.enum([
  'package.json',
  'invoice-register.csv',
  'line-tax-register.csv',
])
export const closeReviewForm = z.strictObject({
  id: z.uuidv4().transform((id) => id.toLowerCase()),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  outcome: z.enum(['reviewed', 'changes_requested']),
  note: z
    .string()
    .transform((value) => value.replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().min(1).max(500))
    .refine((value) => !/\p{Cc}/u.test(value.replaceAll('\n', '').replaceAll('\t', ''))),
})
export type CloseReviewInput = z.infer<typeof closeReviewForm>
type CloseDownload = z.infer<typeof closeDownload>
const frozenFile = z.object({ content: z.string(), sha256: z.hash('sha256') })
const identity = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('draft'),
  id: z.uuidv4(),
  branch: z.string(),
  month: z.string(),
  source: z.string(),
  capturedAt: z.int().positive(),
  breakdown: z.unknown().optional(),
  files: z.object({ 'invoice-register.csv': frozenFile, 'line-tax-register.csv': frozenFile }),
})

function packageUnavailable() {
  return new Response('The saved draft could not be verified. Contact the owner.', { status: 503 })
}

async function readEvidence(
  env: InvoiceEnv,
  email: string,
  branch: string,
  month: string,
  mode: 'save' | 'compare',
) {
  const db = env.DB
  const statements = [
    db
      .prepare(`SELECT 1 AS allowed FROM invoice_effective_grant
      WHERE email = ? AND branch_id = ?
        AND role IN ('owner', 'manager', 'accountant') ${mode === 'save' ? "AND role = 'owner'" : ''}`)
      .bind(email, branch),
    invoiceRegisterStatement(db, email, month, branch),
    lineTaxRegisterStatement(db, email, month, branch),
  ]
  if (mode === 'save') statements.push(gstSummaryStatement(db, email, month, branch))
  const [grant, headers, lines, tax] = await db.batch<
    RegisterRow | LineTaxRow | GstRow | { allowed: number }
  >(statements)
  if (!grant?.results.length) return new Response(null, { status: mode === 'save' ? 403 : 404 })
  if (!headers || !lines) return packageUnavailable()
  const capturedAt = Date.now()
  const register = renderInvoiceRegister(
    headers.results.filter((row) => 'facts_status' in row),
    branch,
  )
  if (register instanceof Response) return register
  const lineTax = renderLineTaxRegister(
    lines.results.filter((row) => 'line_number' in row),
    branch,
  )
  if (lineTax instanceof Response) return lineTax
  const gst = tax && summarizeGstRows(tax.results.filter((row) => 'headerReceivedAt' in row))
  if (gst instanceof Response) return gst
  if (
    register.invoiceCount !== lineTax.invoiceCount ||
    (gst && register.invoiceCount !== gst.invoiceCount)
  ) {
    return packageUnavailable()
  }
  return { register, lineTax, gst, capturedAt }
}

async function capture(env: InvoiceEnv, email: string, branch: string, month: string, id: string) {
  const evidence = await readEvidence(env, email, branch, month, 'save')
  if (evidence instanceof Response) return evidence
  const { register, lineTax, gst, capturedAt } = evidence
  if (!gst) return packageUnavailable()
  const [start, end] = istMonthBounds(month)
  const [invoiceHash, lineHash] = await Promise.all([
    snapshotHash(register.file),
    snapshotHash(lineTax.file),
  ])
  return JSON.stringify({
    schemaVersion: 1,
    status: 'draft',
    id,
    branch,
    month,
    source: env.BILLING_SOURCE,
    capturedAt,
    scope: {
      timezone: 'Asia/Kolkata',
      startUtc: start.toISOString(),
      endUtcExclusive: end.toISOString(),
    },
    sourceWatermark: {
      invoiceCount: register.invoiceCount,
      lineCount: lineTax.lineCount,
      latestReceivedAt: gst.latestReceivedAt,
    },
    breakdown: {
      totalPaise: register.totalPaise,
      missingInvoiceFacts: register.missingFacts,
      incompleteLineCount: lineTax.incompleteLineCount,
      gst,
    },
    coverage: {
      invoices: 'Portal issuance records for this branch. Reconcile source coverage before filing.',
      gstDetails:
        'The summary caps the group and exception previews. The CSVs contain the full included rows.',
      pending: [
        'GSTIN-wide coverage and invoice-number gap reconciliation',
        'Collections, refunds, credit notes, and adjustments',
        'Supplier and settlement evidence',
        'Filing approval and payment evidence',
      ],
    },
    files: {
      'invoice-register.csv': { sha256: invoiceHash, content: register.file },
      'line-tax-register.csv': { sha256: lineHash, content: lineTax.file },
    },
  })
}

function parsePackage(bytes: ArrayBuffer) {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
    )
    const parsed = identity.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function readIndexedPackage(env: InvoiceEnv, draft: MonthlyCloseDraft) {
  const object = await env.FILES.get(draft.objectKey)
  if (!object || object.size !== draft.bytes || object.size > maxPackageBytes) return null
  const bytes = await object.arrayBuffer()
  return (await snapshotHash(bytes)) === draft.sha256 ? bytes : null
}

export async function saveMonthlyClose(
  env: InvoiceEnv,
  email: string,
  branch: string,
  month: string,
  id: string,
): Promise<Response> {
  if (month >= istToday().slice(0, 7))
    return new Response('Choose a closed IST month.', { status: 422 })
  if ((await monthlyCloseBranchRole(env, email, branch)) !== 'owner') {
    return new Response(null, { status: 403 })
  }
  const location = `/portal/reports/close?${new URLSearchParams({ month, branch })}`
  const saved = () => new Response(null, { status: 303, headers: { location } })
  const existing = await readMonthlyCloseDraft(env, email, branch, id)
  if (existing) {
    if (existing.month !== month || existing.createdBy !== email)
      return new Response(null, { status: 409 })
    return (await readIndexedPackage(env, existing)) ? saved() : packageUnavailable()
  }

  const objectKey = `finance-evidence/monthly-close/${id}.json`
  let object = await env.FILES.get(objectKey)
  if (!object) {
    const body = await capture(env, email, branch, month, id)
    if (body instanceof Response) return body
    const bytes = new TextEncoder().encode(body)
    if (bytes.byteLength > maxPackageBytes) {
      return new Response('This branch month exceeds the 4 MiB draft limit.', { status: 422 })
    }
    if ((await monthlyCloseBranchRole(env, email, branch)) !== 'owner') {
      return new Response(null, { status: 403 })
    }
    await env.FILES.put(objectKey, bytes, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { actor: email, sha256: await snapshotHash(bytes) },
    })
    object = await env.FILES.get(objectKey)
  }
  if (!object || object.size > maxPackageBytes) return packageUnavailable()
  if (object.customMetadata?.actor !== email) return new Response(null, { status: 409 })
  const bytes = await object.arrayBuffer()
  const sha256 = await snapshotHash(bytes)
  if (sha256 !== object.customMetadata.sha256) return packageUnavailable()
  const pkg = parsePackage(bytes)
  if (!pkg || pkg.id !== id || pkg.source !== env.BILLING_SOURCE) return packageUnavailable()
  if (pkg.branch !== branch || pkg.month !== month) return new Response(null, { status: 409 })
  // An interrupted D1 write resumes from the original complete R2 object.
  const draft = await recordMonthlyCloseDraft(env, {
    id,
    branchId: branch,
    month,
    capturedAt: pkg.capturedAt,
    createdAt: Math.max(pkg.capturedAt, Date.now()),
    createdBy: email,
    objectKey,
    sha256,
    bytes: object.size,
  })
  if (draft) return saved()
  const stillOwner = (await monthlyCloseBranchRole(env, email, branch)) === 'owner'
  return new Response(null, { status: stillOwner ? 409 : 403 })
}

async function loadDraftPackage(env: InvoiceEnv, email: string, branch: string, id: string) {
  const draft = await readMonthlyCloseDraft(env, email, branch, id)
  if (!draft) return new Response(null, { status: 404 })
  const bytes = await readIndexedPackage(env, draft)
  if (!bytes) return packageUnavailable()
  const pkg = parsePackage(bytes)
  if (
    !pkg ||
    pkg.id !== id ||
    pkg.branch !== branch ||
    pkg.month !== draft.month ||
    pkg.capturedAt !== draft.capturedAt ||
    pkg.source !== env.BILLING_SOURCE
  ) {
    return packageUnavailable()
  }
  return { draft, bytes, pkg }
}

export async function addMonthlyCloseReview(
  env: InvoiceEnv,
  email: string,
  branch: string,
  id: string,
  input: CloseReviewInput,
): Promise<Response> {
  const role = await monthlyCloseBranchRole(env, email, branch)
  if (!role) return new Response(null, { status: 404 })
  if (role !== 'owner')
    return new Response('Only the branch owner can record feedback.', { status: 403 })
  const archive = await loadDraftPackage(env, email, branch, id)
  if (archive instanceof Response) return archive
  const { draft } = archive
  if (input.sha256 !== draft.sha256)
    return new Response('Open this draft again before submitting.', { status: 409 })
  const review = await recordMonthlyCloseReview(env, draft, {
    id: input.id,
    actor: email,
    outcome: input.outcome,
    note: input.note,
    recordedAt: Date.now(),
  })
  if (!review) {
    if ((await monthlyCloseBranchRole(env, email, branch)) !== 'owner') {
      return new Response('Only the branch owner can record feedback.', { status: 403 })
    }
    return new Response(
      'This feedback form was already used. Open the draft to record another entry.',
      { status: 409 },
    )
  }
  return new Response(null, {
    status: 303,
    headers: { location: `/portal/reports/close/${branch}/${id}/review#feedback-${review.id}` },
  })
}

async function checkBillingSource(
  env: InvoiceEnv,
  draft: MonthlyCloseDraft,
  identities: readonly CloseRegisterInvoice[] | null,
): Promise<DraftSourceCheck | null> {
  const observed = await readSourceCoverage(env, draft.branchId, draft.month)
  if (!observed) return null
  const totalPaise = identities?.reduce((total, row) => total + row.totalPaise, 0) ?? 0
  if (!identities || !Number.isSafeInteger(totalPaise)) {
    return { observed, saved: null, sameIdentities: false }
  }
  const invoiceCount = identities.length
  const sameIdentities =
    observed.invoiceCount === invoiceCount &&
    observed.totalPaise === totalPaise &&
    (await snapshotHash(invoiceCoverageIdentityText(identities))) === observed.identitiesSha256
  return { observed, saved: { invoiceCount, totalPaise }, sameIdentities }
}

export async function readMonthlyCloseGstinEvidence(
  env: InvoiceEnv,
  email: string,
  branch: string,
  id: string,
  gstin: string,
) {
  const archive = await loadDraftPackage(env, email, branch, id)
  if (archive instanceof Response) return null
  const { draft, pkg } = archive
  const identities = readCloseRegisterInvoices(pkg.files['invoice-register.csv'].content)
  const source = await checkBillingSource(env, draft, identities)
  return { tax: readGstinDraftTotals(pkg.breakdown, gstin), source }
}

export async function compareMonthlyClose(
  env: InvoiceEnv,
  email: string,
  branch: string,
  id: string,
  page: number,
): Promise<Response> {
  const archive = await loadDraftPackage(env, email, branch, id)
  if (archive instanceof Response) return archive
  const { draft, pkg } = archive
  const evidence = await readEvidence(env, email, branch, draft.month, 'compare')
  if (evidence instanceof Response) return evidence
  const saved = {
    invoices: pkg.files['invoice-register.csv'].content,
    lineTax: pkg.files['line-tax-register.csv'].content,
  }
  const current = { invoices: evidence.register.file, lineTax: evidence.lineTax.file }
  const changes =
    saved.invoices === current.invoices && saved.lineTax === current.lineTax
      ? []
      : compareCloseRegisters(saved, current)
  const savedInvoices = readCloseRegisterInvoices(saved.invoices)
  const billingCheck = await checkBillingSource(env, draft, savedInvoices)
  const numbering = savedInvoices && reviewInvoiceNumbering(draft.month, savedInvoices)
  if (!(await monthlyCloseBranchRole(env, email, branch))) {
    return new Response(null, { status: 404 })
  }
  if (!changes) {
    return new Response('The saved and current register formats could not be compared.', {
      status: 422,
    })
  }
  return renderMonthlyCloseComparison(
    draft,
    evidence.capturedAt,
    changes,
    page,
    billingCheck,
    numbering,
  )
}

export async function downloadMonthlyClose(
  env: InvoiceEnv,
  email: string,
  branch: string,
  id: string,
  file: CloseDownload,
): Promise<Response> {
  const archive = await loadDraftPackage(env, email, branch, id)
  if (archive instanceof Response) return archive
  const { draft, bytes, pkg } = archive
  if (!(await auditMonthlyCloseDownload(env, email, draft, file))) {
    return new Response(null, { status: 404 })
  }
  const json = file === 'package.json'
  return new Response(json ? bytes : pkg.files[file].content, {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': json ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="close-${branch}-${draft.month}-v${draft.version}-${file}"`,
      'x-invoice-close-sha256': json ? draft.sha256 : pkg.files[file].sha256,
    },
  })
}
