/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 28-06-2026 & Updated - 28-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/invoice-pdf
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-triggered job (enqueued at booking completion) that
 *                renders the GST invoice PDF via the standalone Cloud Run
 *                invoicing service over HMAC-signed HTTP, stores the resulting
 *                URL on the invoice, and emails the customer their invoice with
 *                the PDF attached. Durable + retryable so completion never
 *                blocks on rendering.
 *
 * Responsibilities :
 * - Verify the QStash signature (401 on failure)
 * - Load the invoice + items + seller/customer via getInvoiceForPdf
 * - Build + validate the InvoicePdfPayload (render contract)
 * - Call the render service (HMAC-signed) and persist the PDF URL
 * - Email the invoice WITH the PDF attached (WITHOUT it on any service error)
 *
 * Features / Functionality :
 * - Graceful degradation: no-attachment email when the service is unconfigured
 *   or errors, so the customer always receives their invoice
 * - 200 on handled outcomes (no retry storm); 500 only on unexpected errors
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/env, @/lib/jobs/verify, @/lib/notifications/providers/email,
 *                @rgss/business, @rgss/db/queries, @rgss/logger, @rgss/types
 *
 * Notes        :
 * - All money is integer paise. CGST/SGST are split evenly from the GST total.
 * - The branch table has no GSTIN/SAC columns: SAC falls back to the
 *   project-wide constant (999721) and GSTIN is left undefined (optional).
 ************************************************************/

import { env } from '@/env'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { sendEmail } from '@/lib/notifications/providers/email'
import { buildInvoiceEmailHtml, signRequest } from '@rgss/business'
import { getInvoiceForPdf, setInvoicePdfUrl } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import {
  type InvoicePdfPayload,
  invoicePdfPayloadSchema,
  invoicePdfResultSchema,
} from '@rgss/types'

// QStash-triggered invoice-pdf job. Route shape (NOT withErrorHandler): read raw
// body → verify QStash signature (401 on fail) → load + render + email → 200.
// A thrown/unexpected error returns 500 so QStash retries with backoff; handled
// outcomes (missing invoice, unconfigured/erroring service) return 200 to avoid
// a retry storm — the customer still gets their invoice via the no-attachment
// fallback email.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// SAC code for beauty/wellness services (project-wide billing convention).
const SAC_CODE = '999721'
// Wall-clock budget for the render service call and the PDF byte fetch.
const SERVICE_TIMEOUT_MS = 10_000

const logger = createLogger({
  service: 'web:jobs:invoice-pdf',
  environment: process.env.NODE_ENV ?? 'development',
})

type Payload = { invoiceId?: unknown }
type LoadedInvoice = NonNullable<Awaited<ReturnType<typeof getInvoiceForPdf>>>

export const POST = async (req: Request) => {
  const bodyText = await req.text()

  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = parseBody(bodyText)
    const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId : null
    if (!invoiceId) {
      logger.warn('invoice-pdf job called without a valid invoiceId')
      return Response.json({ success: true, skipped: 'no-invoice-id' })
    }

    // Missing invoice → nothing to do. Return 200 so QStash does not retry forever.
    const loaded = await getInvoiceForPdf(invoiceId)
    if (!loaded) {
      logger.warn('invoice-pdf job: invoice not found', { invoiceId })
      return Response.json({ success: true, skipped: 'invoice-not-found' })
    }

    // Build + defensively validate the render payload before sending it on.
    const parsedPayload = invoicePdfPayloadSchema.safeParse(buildPdfPayload(loaded))
    if (!parsedPayload.success) {
      logger.error('invoice-pdf job: payload failed validation', {
        invoiceId,
        issues: parsedPayload.error.flatten(),
      })
      // Data problem — a retry will not fix it. Still email the invoice (no PDF).
      const sent = await sendInvoiceEmail(loaded)
      return Response.json({ success: true, attached: false, reason: 'invalid-payload', sent })
    }
    const renderPayload = parsedPayload.data

    const serviceUrl = env.INVOICING_SERVICE_URL
    const secret = env.INVOICE_PDF_HMAC_SECRET

    // Service unconfigured → fallback no-attachment email (Property: customer
    // always receives their invoice).
    if (!serviceUrl || !secret) {
      logger.info('invoice-pdf job: render service not configured; sending no-attachment email', {
        invoiceId,
      })
      const sent = await sendInvoiceEmail(loaded)
      return Response.json({ success: true, attached: false, reason: 'service-unconfigured', sent })
    }

    // Call the render service (HMAC-signed over `${timestamp}.${body}`).
    const requestBody = JSON.stringify(renderPayload)
    const timestamp = Date.now()
    const signature = await signRequest({ secret, body: requestBody, timestamp })

    let renderResponse: Response
    try {
      renderResponse = await fetch(`${serviceUrl}/v1/invoices`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rgss-timestamp': String(timestamp),
          'x-rgss-signature': signature,
        },
        body: requestBody,
        signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
      })
    } catch (serviceError) {
      logger.error('invoice-pdf job: render service call failed', {
        invoiceId,
        error: serviceError instanceof Error ? serviceError.message : String(serviceError),
      })
      const sent = await sendInvoiceEmail(loaded)
      return Response.json({ success: true, attached: false, reason: 'service-error', sent })
    }

    if (!renderResponse.ok) {
      logger.error('invoice-pdf job: render service returned non-2xx', {
        invoiceId,
        status: renderResponse.status,
      })
      const sent = await sendInvoiceEmail(loaded)
      return Response.json({
        success: true,
        attached: false,
        reason: `service-status-${renderResponse.status}`,
        sent,
      })
    }

    const parsedResult = invoicePdfResultSchema.safeParse(await renderResponse.json())
    if (!parsedResult.success) {
      logger.error('invoice-pdf job: render service returned an invalid result', { invoiceId })
      const sent = await sendInvoiceEmail(loaded)
      return Response.json({ success: true, attached: false, reason: 'invalid-result', sent })
    }
    const result = parsedResult.data

    // Persist the stored PDF URL onto the invoice row.
    await setInvoicePdfUrl(invoiceId, result.pdfUrl)

    // Resolve the PDF bytes: prefer the inline base64 returned by the service,
    // otherwise fetch the stored URL and base64-encode it.
    const base64 = result.pdfBase64 ?? (await fetchPdfBase64(result.pdfUrl))
    const attachments = base64
      ? [{ filename: `${result.invoiceNumber}.pdf`, content: base64 }]
      : undefined
    if (!attachments) {
      logger.warn('invoice-pdf job: could not resolve PDF bytes; sending no-attachment email', {
        invoiceId,
      })
    }

    const sent = await sendInvoiceEmail(loaded, attachments)
    return Response.json({
      success: true,
      attached: Boolean(attachments),
      reused: result.reused,
      sent,
    })
  } catch (error) {
    // Unexpected failure (e.g. DB/signing error) → 500 so QStash retries.
    logger.error('[job:invoice-pdf]', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}

function parseBody(bodyText: string): Payload {
  try {
    return JSON.parse(bodyText) as Payload
  } catch {
    return {}
  }
}

// Map the loaded invoice into the fully-computed render contract. Money is taken
// verbatim from the invoice columns (the service never recomputes). CGST/SGST
// are split evenly from the GST total so cgst + sgst === gst exactly.
function buildPdfPayload(loaded: LoadedInvoice): InvoicePdfPayload {
  const { invoice: inv, items, branch, customer, bookingNumber } = loaded

  const addressLines = [
    branch.addressLine1,
    branch.addressLine2,
    `${branch.city}, ${branch.state} ${branch.pincode}`,
  ].filter((line): line is string => Boolean(line?.trim()))

  const cgstPaise = Math.floor(inv.gstAmountPaise / 2)
  const sgstPaise = inv.gstAmountPaise - cgstPaise

  return {
    templateVersion: 'v1',
    invoiceNumber: inv.invoiceNumber,
    issuedAt: inv.createdAt.toISOString(),
    paymentMethod: inv.paymentMethod,
    bookingNumber: bookingNumber ?? undefined,
    seller: {
      name: branch.name,
      addressLines,
      // GSTIN is not stored on the branch table → left undefined (optional).
      gstin: undefined,
      phone: branch.phone ?? undefined,
      email: branch.email ?? undefined,
      sacCode: SAC_CODE,
    },
    customer: {
      name: customer.name,
      email: customer.email ?? undefined,
      phone: customer.phone ?? undefined,
    },
    items: items.map((item) => ({
      name: item.serviceNameSnapshot,
      staffName: item.staffNameSnapshot ?? undefined,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      totalPricePaise: item.totalPricePaise,
      // The gems-redeemed service is marked covered (its line total is 0).
      gemsCovered: item.serviceId === inv.gemsRedeemedServiceId,
    })),
    totals: {
      subtotalPaise: inv.subtotalPaise,
      discountPaise: inv.discountAmountPaise,
      taxableValuePaise: inv.taxableValuePaise,
      cgstPaise,
      sgstPaise,
      gstPaise: inv.gstAmountPaise,
      totalPaise: inv.totalAmountPaise,
    },
    gemsEarned: inv.gemsEarned,
    gemsRedeemed: inv.gemsRedeemed,
    notes: inv.notes ?? undefined,
  }
}

// Send the invoice email (same content the complete route built inline), with
// the PDF attached when provided. Skipped when the customer has no email
// (mirrors the complete route's guard). Best-effort: sendEmail never throws.
async function sendInvoiceEmail(
  loaded: LoadedInvoice,
  attachments?: { filename: string; content: string }[],
): Promise<boolean> {
  const { invoice: inv, items, customer, bookingNumber } = loaded

  if (!customer.email) {
    logger.info('invoice-pdf job: customer has no email; skipping invoice email', {
      invoiceId: inv.id,
    })
    return false
  }

  const { subject, html } = buildInvoiceEmailHtml({
    customerName: customer.name ?? 'Guest',
    invoiceNumber: inv.invoiceNumber,
    bookingNumber,
    items: items.map((item) => ({
      name: item.serviceNameSnapshot,
      staff: item.staffNameSnapshot,
      // Gems-covered line is already 0 in the invoice item total.
      pricePaise: item.totalPricePaise,
    })),
    subtotalPaise: inv.subtotalPaise,
    discountPaise: inv.discountAmountPaise,
    gstPaise: inv.gstAmountPaise,
    totalPaise: inv.totalAmountPaise,
    gemsEarned: inv.gemsEarned,
    paymentMethod: inv.paymentMethod,
    issuedAt: inv.createdAt,
  })

  return await sendEmail({
    to: customer.email,
    subject,
    html,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  })
}

// Fetch the stored PDF and base64-encode it for email attachment. Returns null
// on any failure (the caller then sends the email without an attachment).
async function fetchPdfBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) })
    if (!res.ok) {
      logger.error('invoice-pdf job: failed to fetch PDF bytes', { status: res.status })
      return null
    }
    const buffer = await res.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch (error) {
    logger.error('invoice-pdf job: error fetching PDF bytes', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
