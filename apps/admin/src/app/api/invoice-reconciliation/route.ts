import { createHash } from 'node:crypto'
import { istDateInDays, istMonthBounds, istToday, monthKeyIST } from '@rgss/business'
import {
  getBranchById,
  getBranchMembershipBalances,
  getBranchSettlementReport,
  readCheckoutCollections,
  readInvoiceReconciliation,
  readInvoiceSourceCoverage,
  readPublishedInvoiceIssueBody,
} from '@rgss/db/queries'
import { AppError, badRequest, conflict, ERROR_CODES, forbidden, notFound } from '@rgss/errors'
import {
  branchSettlementSnapshotSchema,
  checkoutCollectionsSnapshotSchema,
  INVOICE_BRANCH_SETTLEMENT_PATH,
  INVOICE_CHECKOUT_COLLECTIONS_PATH,
  INVOICE_ISSUE_EVENT_MAX_BYTES,
  INVOICE_RECONCILIATION_PATH,
  INVOICE_RECOVERY_PATH,
  INVOICE_SOURCE_COVERAGE_PATH,
  invoiceBranchReconciliationResponseSchema,
  invoiceCoverageIdentityText,
  invoiceEventIdSchema,
  invoiceIssueEventSchema,
  invoiceReconciliationMonthSchema,
  invoiceReconciliationResponseSchema,
  invoiceSourceCoverageSchema,
  MAX_INVOICE_SOURCE_COVERAGE_ROWS,
} from '@rgss/types'
import { z } from 'zod'
import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { ADMIN_ORIGIN, isAllowedOrigin } from '@/lib/cors'
import {
  type InvoiceEventsConfig,
  readInvoiceEventsConfig,
  requestInvoiceWorker,
} from '@/lib/invoices/issue-event-transport'
import { archiveStoredInvoice } from '@/lib/invoices/original-archive'

export const dynamic = 'force-dynamic'

const snapshotScope = z.strictObject({
  month: invoiceReconciliationMonthSchema,
  branchId: invoiceEventIdSchema,
  report: z.enum(['checkout_collections', 'branch_settlement']).optional(),
})
const recoveryScope = z.strictObject({
  report: z.literal('recover_invoice'),
  branchId: invoiceEventIdSchema,
  invoiceId: invoiceEventIdSchema,
  reason: z.string().trim().min(1).max(200),
})
const archiveScope = recoveryScope.extend({ report: z.literal('archive_original') })
const publishScope = z.union([snapshotScope, recoveryScope, archiveScope])
const MAX_PUBLISH_REQUEST_BYTES = 1024

const zeroTotals = { invoiceCount: 0, totalPaise: 0 }
const zeroSource = {
  ...zeroTotals,
  publishedCount: 0,
  pendingCount: 0,
  failedCount: 0,
  uncapturedCount: 0,
}

function unavailable(message: string) {
  return new AppError({
    code: ERROR_CODES.UPSTREAM_ERROR,
    message,
    statusCode: 503,
    retryable: true,
  })
}

async function portalSummary(config: InvoiceEventsConfig, month: string) {
  try {
    const response = await requestInvoiceWorker(
      config,
      INVOICE_RECONCILIATION_PATH,
      JSON.stringify({ version: 1, type: 'invoice.reconciliation', source: config.source, month }),
    )
    if (response.status === 200) {
      const result = invoiceReconciliationResponseSchema.safeParse(await response.json())
      if (result.success && result.data.source === config.source && result.data.month === month) {
        return result.data
      }
    } else {
      await response.body?.cancel()
    }
  } catch {
    // Suppress raw upstream errors and response bodies, which may contain credentials.
  }
  throw unavailable('The invoice portal did not return a valid summary for that month.')
}

async function reconcileBranch(config: InvoiceEventsConfig, month: string, branchId: string) {
  const neon = await readInvoiceSourceCoverage(...istMonthBounds(month), branchId)
  if (neon.length > MAX_INVOICE_SOURCE_COVERAGE_ROWS) {
    throw badRequest('The branch month exceeds the coverage limit.')
  }
  const message = 'The invoice portal did not return a valid report for that month and branch.'
  const response = await requestInvoiceWorker(
    config,
    INVOICE_RECONCILIATION_PATH,
    JSON.stringify({
      version: 1,
      type: 'invoice.branch-reconciliation',
      source: config.source,
      month,
      branchId,
    }),
  ).catch(() => {
    throw unavailable(message)
  })
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined)
    if (response.status === 422)
      throw badRequest('The branch month exceeds the portal coverage limit.')
    throw unavailable(message)
  }
  const result = invoiceBranchReconciliationResponseSchema.safeParse(
    await response.json().catch(() => null),
  )
  if (
    !result.success ||
    result.data.source !== config.source ||
    result.data.month !== month ||
    result.data.branchId !== branchId
  ) {
    throw unavailable(message)
  }

  const portal = result.data.invoices
  const neonById = new Map(neon.map((invoice) => [invoice.invoiceId, invoice]))
  const portalById = new Map(portal.map((invoice) => [invoice.invoiceId, invoice]))
  const ids = new Set([...neonById.keys(), ...portalById.keys()])
  const exceptions = [...ids].sort().flatMap((invoiceId) => {
    const source = neonById.get(invoiceId)
    const received = portalById.get(invoiceId)
    const reason = !source
      ? 'missing_from_neon'
      : !received
        ? 'missing_from_portal'
        : source.totalPaise !== received.totalPaise
          ? 'amount_differs'
          : source.publication !== 'published'
            ? 'publication_incomplete'
            : null
    return reason
      ? [
          {
            invoiceId,
            reason,
            neonPaise: source?.totalPaise ?? null,
            portalPaise: received?.totalPaise ?? null,
            publication: source?.publication ?? null,
          },
        ]
      : []
  })
  const status = exceptions.some(({ reason }) => reason !== 'publication_incomplete')
    ? 'different'
    : exceptions.length
      ? 'incomplete'
      : ids.size
        ? 'matched'
        : 'empty'
  return apiSuccess({
    source: config.source,
    branchId,
    month,
    checkedAt: result.data.checkedAt,
    status,
    neonCount: neon.length,
    portalCount: portal.length,
    exceptions,
  })
}

async function backfillInventory(month: string, branchId: string, checkedAt: string) {
  const rows = await readInvoiceSourceCoverage(...istMonthBounds(month), branchId)
  if (rows.length > MAX_INVOICE_SOURCE_COVERAGE_ROWS)
    throw badRequest('The branch month exceeds the backfill inventory limit.')

  const invoices = rows.map((row) => ({
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    totalPaise: row.totalPaise,
    publication: row.publication,
    periodBasis: row.savedIssueTime ? 'saved_issue_time' : 'creation_time_fallback',
    pinnedEvent: row.pinnedEvent,
    legacyPdfReference: row.legacyPdfReference,
    nextAction:
      row.publication === 'published' && row.pinnedEvent
        ? 'verify_published_event'
        : row.publication === 'pending' || row.publication === 'failed'
          ? 'review_outbox'
          : row.legacyPdfReference
            ? 'verify_original_pdf'
            : 'locate_original_evidence',
  }))
  return apiSuccess({ branchId, month, checkedAt, invoiceCount: invoices.length, invoices })
}

export const GET = withErrorHandler(async (request: Request) => {
  await requireRole('developer')
  const now = new Date()
  const query = new URL(request.url).searchParams
  const month = invoiceReconciliationMonthSchema.safeParse(query.get('month') ?? monthKeyIST(now))
  if (!month.success || month.data >= istToday(now).slice(0, 7)) {
    throw badRequest('Choose a closed invoice month in YYYY-MM format.')
  }
  const branch = invoiceEventIdSchema.safeParse(query.get('branchId'))
  if (query.get('report') === 'backfill_inventory') {
    if (!branch.success) throw badRequest('Choose an invoice branch for the backfill inventory.')
    return backfillInventory(month.data, branch.data, now.toISOString())
  }
  const config = readInvoiceEventsConfig()
  if (config.status !== 'ready') throw unavailable('The invoice portal connection is unavailable.')
  if (query.has('branchId')) {
    if (!branch.success) throw badRequest('Choose a valid invoice branch.')
    return reconcileBranch(config, month.data, branch.data)
  }

  const [source, portal] = await Promise.all([
    readInvoiceReconciliation(...istMonthBounds(month.data)),
    portalSummary(config, month.data),
  ])
  const neonByBranch = new Map(source.map(({ branchId, ...totals }) => [branchId, totals]))
  const portalByBranch = new Map(
    portal.branches.map(({ branchId, ...totals }) => [branchId, totals]),
  )
  const ids = new Set([...neonByBranch.keys(), ...portalByBranch.keys()])
  const branches = [...ids].sort().map((branchId) => {
    const neon = neonByBranch.get(branchId) ?? zeroSource
    const received = portalByBranch.get(branchId) ?? zeroTotals
    const delta = {
      invoiceCount: received.invoiceCount - neon.invoiceCount,
      totalPaise: received.totalPaise - neon.totalPaise,
    }
    const status =
      delta.invoiceCount !== 0 || delta.totalPaise !== 0
        ? 'different'
        : neon.publishedCount !== neon.invoiceCount
          ? 'incomplete'
          : 'matched'
    return { branchId, neon, portal: received, delta, status }
  })
  const status = branches.some((branch) => branch.status === 'different')
    ? 'different'
    : branches.some((branch) => branch.status === 'incomplete')
      ? 'incomplete'
      : branches.length
        ? 'matched'
        : 'empty'
  return apiSuccess({
    source: config.source,
    month: month.data,
    checkedAt: portal.checkedAt,
    status,
    branches,
  })
})

function scopeTooLarge() {
  return new AppError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'The coverage request is too large.',
    statusCode: 413,
  })
}

async function readPublishScope(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Send the coverage request as JSON.',
      statusCode: 415,
    })
  }
  if (Number(request.headers.get('content-length')) > MAX_PUBLISH_REQUEST_BYTES) {
    throw scopeTooLarge()
  }
  if (!request.body) throw badRequest('Choose an invoice month and branch.')

  const bytes = new Uint8Array(MAX_PUBLISH_REQUEST_BYTES)
  const reader = request.body.getReader()
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (length + value.length > MAX_PUBLISH_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw scopeTooLarge()
      }
      bytes.set(value, length)
      length += value.length
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))
    const parsed = publishScope.safeParse(JSON.parse(text))
    if (parsed.success) return parsed.data
  } catch (error) {
    if (error instanceof AppError) throw error
  } finally {
    reader.releaseLock()
  }
  throw badRequest('Choose an invoice month and branch.')
}

export const POST = withErrorHandler(async (request: Request) => {
  const session = await requireRole('developer')
  if (
    !isAllowedOrigin(process.env.NEXT_PUBLIC_APP_URL ?? ADMIN_ORIGIN, request.headers.get('origin'))
  ) {
    throw forbidden('Submit the request from the admin portal.')
  }

  const selection = await readPublishScope(request)
  if (selection.report === 'recover_invoice') return recoverInvoice(request, session, selection)
  if (selection.report === 'archive_original') {
    const config = readInvoiceEventsConfig()
    if (config.status !== 'ready')
      throw unavailable('The invoice portal connection is unavailable.')
    const { branchId, invoiceId, reason } = selection
    const status = await archiveStoredInvoice(config, invoiceId, branchId)
    await audit(request, session, {
      action: 'update',
      entityType: 'invoice_original_archive',
      entityId: invoiceId,
      branchId,
      newValues: { status, reason },
    })
    return apiSuccess({ invoiceId, branchId, status })
  }
  const { month, branchId, report } = selection
  const observed = new Date()
  const currentMonth = istToday(observed).slice(0, 7)
  if (month > currentMonth || (!report && month === currentMonth)) {
    if (report) throw badRequest('Choose the current month or a previous month in YYYY-MM format.')
    throw badRequest('Choose a closed invoice month in YYYY-MM format.')
  }
  const config = readInvoiceEventsConfig()
  if (config.status !== 'ready') throw unavailable('The invoice portal connection is unavailable.')

  const readers = {
    checkout_collections: [INVOICE_CHECKOUT_COLLECTIONS_PATH, readCollectionsPayload],
    branch_settlement: [INVOICE_BRANCH_SETTLEMENT_PATH, readSettlementPayload],
    coverage: [INVOICE_SOURCE_COVERAGE_PATH, readCoveragePayload],
  } as const
  const reportKind = report ?? 'coverage'
  const [path, read] = readers[reportKind]
  const payload = await read(config.source, month, branchId, observed)
  let status: number
  try {
    const response = await requestInvoiceWorker(config, path, JSON.stringify(payload))
    status = response.status
    await response.body?.cancel()
  } catch {
    throw unavailable('The invoice portal did not acknowledge the report.')
  }
  if (status === 201) {
    await audit(request, session, {
      action: 'update',
      entityType: 'invoice_portal_report',
      entityId: `${reportKind}:${branchId}:${month}`,
      branchId,
      newValues: { report: reportKind, month, observedAt: observed.toISOString() },
    })
    return apiSuccess({ month, branchId, status: 'published' })
  }
  if (status === 204) {
    return apiSuccess({ month, branchId, status: 'unchanged' })
  }
  if (status === 409) {
    throw conflict(
      ERROR_CODES.CONFLICT,
      'The observation conflicted with one already received. Submit it again.',
    )
  }
  throw unavailable('The invoice portal did not acknowledge the report.')
})

async function recoverInvoice(
  request: Request,
  session: Awaited<ReturnType<typeof requireRole>>,
  { branchId, invoiceId, reason }: z.infer<typeof recoveryScope>,
) {
  const config = readInvoiceEventsConfig()
  if (config.status !== 'ready') throw unavailable('The invoice portal connection is unavailable.')
  const eventBody = await readPublishedInvoiceIssueBody(invoiceId, branchId)
  if (!eventBody) throw notFound('No published invoice event exists for this invoice and branch.')
  const invalid = () =>
    conflict(ERROR_CODES.CONFLICT, 'The saved event cannot be recovered in this environment.')
  let event: unknown
  try {
    event = JSON.parse(eventBody)
  } catch {
    throw invalid()
  }
  const parsed = invoiceIssueEventSchema.safeParse(event)
  if (
    !parsed.success ||
    parsed.data.source !== config.source ||
    parsed.data.invoiceId !== invoiceId ||
    parsed.data.branchId !== branchId ||
    Buffer.byteLength(eventBody, 'utf8') > INVOICE_ISSUE_EVENT_MAX_BYTES
  )
    throw invalid()

  const message = 'The invoice portal did not acknowledge the recovery.'
  const response = await requestInvoiceWorker(
    config,
    INVOICE_RECOVERY_PATH,
    JSON.stringify({ version: 1, type: 'invoice.recovery', eventBody }),
  ).catch(() => {
    throw unavailable(message)
  })
  await response.body?.cancel().catch(() => undefined)
  if (response.status === 409)
    throw conflict(ERROR_CODES.CONFLICT, 'The saved invoice conflicts with a record in the portal.')
  if (response.status !== 201 && response.status !== 204) throw unavailable(message)
  const status = response.status === 201 ? 'restored' : 'verified'
  await audit(request, session, {
    action: 'update',
    entityType: 'invoice_portal_recovery',
    entityId: invoiceId,
    branchId,
    newValues: { status, reason },
  })
  return apiSuccess({ invoiceId, branchId, status })
}

async function readSettlementPayload(
  source: string,
  month: string,
  branchId: string,
  observed: Date,
) {
  if (!(await getBranchById(branchId))) throw notFound('Branch not found.')
  const [, end] = istMonthBounds(month)
  const lastDay = istDateInDays(end, -1)
  const today = istToday(observed)
  const through = today < lastDay ? today : lastDay
  const [report, membershipBalances] = await Promise.all([
    getBranchSettlementReport(branchId, { from: `${month}-01`, to: through }),
    month === today.slice(0, 7) ? getBranchMembershipBalances(branchId, observed) : undefined,
  ])
  return branchSettlementSnapshotSchema.parse({
    version: 1,
    type: 'invoice.branch-settlement',
    source,
    branchId,
    month,
    observedAt: observed.toISOString(),
    through,
    report,
    ...(membershipBalances ? { membershipBalances } : {}),
  })
}

async function readCollectionsPayload(
  source: string,
  month: string,
  branchId: string,
  observed: Date,
) {
  const [start, end] = istMonthBounds(month)
  const asOf = new Date(Math.min(end.getTime(), observed.getTime()))
  const rows = start < asOf ? await readCheckoutCollections(start, asOf, branchId) : []
  return checkoutCollectionsSnapshotSchema.parse({
    version: 1,
    type: 'invoice.checkout-collections',
    source,
    month,
    branchId,
    observedAt: observed.toISOString(),
    rows,
  })
}

async function readCoveragePayload(
  source: string,
  month: string,
  branchId: string,
  observed: Date,
) {
  const rows = await readInvoiceSourceCoverage(...istMonthBounds(month), branchId)
  if (rows.length > MAX_INVOICE_SOURCE_COVERAGE_ROWS) {
    throw badRequest('The branch month exceeds the coverage limit.')
  }
  const totals = { ...zeroSource, invoiceCount: rows.length }
  for (const row of rows) {
    totals[`${row.publication}Count`]++
    totals.totalPaise += row.totalPaise
  }
  return invoiceSourceCoverageSchema.parse({
    version: 1,
    type: 'invoice.source-coverage',
    source,
    month,
    branchId,
    observedAt: observed.toISOString(),
    ...totals,
    identitiesSha256: createHash('sha256').update(invoiceCoverageIdentityText(rows)).digest('hex'),
  })
}
