/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/app
 * Scope        : HTTP (Hono application)
 *
 * Description  : The invoicing service HTTP surface.
 *                - GET  /healthz       liveness probe
 *                - POST /v1/invoices   HMAC-verified render + store (idempotent)
 *
 * Security     : EVERY /v1/invoices request is HMAC-SHA256 verified (shared
 *                secret over `${timestamp}.${rawBody}`) BEFORE any parsing or
 *                rendering work. Failures return 401 with no work performed.
 *                Handlers never leak stack traces; unexpected errors are logged
 *                and (when configured) reported to Sentry.
 *
 * Invariant    : The service NEVER recomputes tax/discount/total — it renders
 *                the supplied paise values and validates its own response shape
 *                against invoicePdfResultSchema before returning.
 ************************************************************/
import { verifyRequest } from '@rgss/business'
import { createLogger } from '@rgss/logger'
import type { InvoicePdfResult } from '@rgss/types'
import { invoicePdfPayloadSchema, invoicePdfResultSchema } from '@rgss/types'
import { Hono } from 'hono'
import { env } from './env'
import { renderInvoicePdf } from './render'
import { captureException } from './sentry'
import { buildObjectKey, buildPdfUrl, getPdfBytes, objectExists, putPdf } from './storage/r2'

const logger = createLogger({ service: 'invoicing', environment: env.NODE_ENV })

export const app = new Hono()

app.get('/healthz', (c) => c.json({ status: 'ok' }))

app.post('/v1/invoices', async (c) => {
  try {
    // 1. Read the RAW body exactly as signed (no re-serialisation).
    const rawText = await c.req.text()
    const timestampHeader = c.req.header('x-rgss-timestamp')
    const signature = c.req.header('x-rgss-signature')

    // 2. HMAC verify BEFORE any work. Missing headers fail closed.
    if (!timestampHeader || !signature) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing signature headers' } }, 401)
    }
    const verified = await verifyRequest({
      secret: env.INVOICE_PDF_HMAC_SECRET,
      body: rawText,
      timestamp: Number(timestampHeader),
      signature,
    })
    if (!verified) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid signature' } }, 401)
    }

    // 3. Parse + validate the body against the shared contract.
    let json: unknown
    try {
      json = JSON.parse(rawText)
    } catch {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Body is not valid JSON' } }, 400)
    }
    const parsed = invoicePdfPayloadSchema.safeParse(json)
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid invoice payload',
            details: parsed.error.flatten().fieldErrors,
          },
        },
        400,
      )
    }
    const payload = parsed.data

    // 4. Idempotency: derive the key; replay a stored PDF if present.
    const key = buildObjectKey(payload.invoiceNumber, payload.issuedAt)
    const pdfUrl = buildPdfUrl(key)

    let result: InvoicePdfResult
    if (await objectExists(key)) {
      const bytes = await getPdfBytes(key)
      result = {
        invoiceNumber: payload.invoiceNumber,
        pdfUrl,
        pdfBase64: Buffer.from(bytes).toString('base64'),
        reused: true,
      }
      logger.info('invoice pdf reused', { invoiceNumber: payload.invoiceNumber, key })
    } else {
      const bytes = await renderInvoicePdf(payload)
      await putPdf(key, bytes)
      result = {
        invoiceNumber: payload.invoiceNumber,
        pdfUrl,
        pdfBase64: Buffer.from(bytes).toString('base64'),
        reused: false,
      }
      logger.info('invoice pdf rendered', { invoiceNumber: payload.invoiceNumber, key })
    }

    // 5. Validate our own response shape before returning.
    const validated = invoicePdfResultSchema.safeParse(result)
    if (!validated.success) {
      logger.error('invoice result failed self-validation', {
        invoiceNumber: payload.invoiceNumber,
      })
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, 500)
    }

    return c.json(validated.data, 200)
  } catch (error) {
    // Never leak stack traces to the caller.
    logger.error('invoice render failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    captureException(error)
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, 500)
  }
})
