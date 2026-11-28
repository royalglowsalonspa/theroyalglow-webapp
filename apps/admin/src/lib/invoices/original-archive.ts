import { hasCompleteInvoicePdf } from '@rgss/business'
import { readOriginalInvoiceArchiveCandidate } from '@rgss/db/queries'
import { AppError, conflict, ERROR_CODES, notFound, serviceUnavailable } from '@rgss/errors'
import {
  INVOICE_ORIGINAL_ARCHIVE_PATH,
  INVOICE_ORIGINAL_PDF_MAX_BYTES,
  invoiceOriginalArchiveSchema,
} from '@rgss/types'
import { env } from '@/env'
import {
  type InvoiceEventsConfig,
  requestInvoiceWorker,
} from '@/lib/invoices/issue-event-transport'
import { requestStoredInvoicePdf } from '@/lib/invoices/pdf-access'

function invalidPdf() {
  return new AppError({
    statusCode: 422,
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'The archived PDF must be a valid PDF of at most 1 MiB.',
  })
}

async function readOriginalPdf(response: Response) {
  if (
    response.status !== 200 ||
    !response.body ||
    response.headers.get('content-type') !== 'application/pdf'
  ) {
    await response.body?.cancel().catch(() => undefined)
    if (response.status === 404)
      throw notFound('The legacy renderer has no stored PDF for this invoice.')
    throw serviceUnavailable('archived invoice PDF')
  }
  if (Number(response.headers.get('content-length')) > INVOICE_ORIGINAL_PDF_MAX_BYTES) {
    await response.body.cancel().catch(() => undefined)
    throw invalidPdf()
  }

  const bytes = Buffer.alloc(INVOICE_ORIGINAL_PDF_MAX_BYTES)
  const reader = response.body.getReader()
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (size + value.byteLength > bytes.byteLength) {
        await reader.cancel().catch(() => undefined)
        throw invalidPdf()
      }
      bytes.set(value, size)
      size += value.byteLength
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw serviceUnavailable('archived invoice PDF')
  } finally {
    reader.releaseLock()
  }
  if (!hasCompleteInvoicePdf(bytes.subarray(0, size))) throw invalidPdf()
  return bytes.toString('base64', 0, size)
}

export async function archiveStoredInvoice(
  config: InvoiceEventsConfig,
  invoiceId: string,
  branchId: string,
) {
  if (!env.INVOICING_SERVICE_URL || !env.INVOICE_PDF_HMAC_SECRET)
    throw serviceUnavailable('archived invoice PDF')
  const candidate = await readOriginalInvoiceArchiveCandidate(invoiceId, branchId)
  if (!candidate)
    throw notFound('No uncaptured invoice with a unique legacy PDF key was found for this branch.')
  const parsed = invoiceOriginalArchiveSchema.omit({ pdfBase64: true }).safeParse({
    ...candidate,
    version: 1,
    type: 'invoice.original-archive',
    source: config.source,
  })
  if (!parsed.success || parsed.data.invoiceId !== invoiceId || parsed.data.branchId !== branchId)
    throw conflict(ERROR_CODES.CONFLICT, 'The archived invoice does not match the selected record.')
  const pdf = await requestStoredInvoicePdf(
    env.INVOICING_SERVICE_URL,
    env.INVOICE_PDF_HMAC_SECRET,
    parsed.data.invoiceNumber,
    parsed.data.recordedAt,
  ).catch(() => {
    throw serviceUnavailable('archived invoice PDF')
  })
  const pdfBase64 = await readOriginalPdf(pdf)
  const ack = await requestInvoiceWorker(
    config,
    INVOICE_ORIGINAL_ARCHIVE_PATH,
    JSON.stringify({ ...parsed.data, pdfBase64 }),
  ).catch(() => {
    throw serviceUnavailable('invoice archive')
  })
  await ack.body?.cancel().catch(() => undefined)
  if (ack.status === 409)
    throw conflict(ERROR_CODES.CONFLICT, 'The portal has conflicting invoice archive data.')
  if (ack.status === 422) throw invalidPdf()
  if (ack.status !== 201 && ack.status !== 204) throw serviceUnavailable('invoice archive')
  return ack.status === 201 ? 'archived' : 'verified'
}
