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
 *                - POST /v1/invoices/download   HMAC-verified read of a stored PDF
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
import { invoicePdfObjectKey, verifyRequest } from '@rgss/business'
import { createLogger } from '@rgss/logger'
import type { InvoicePdfResult } from '@rgss/types'
import {
  invoicePdfDownloadSchema,
  invoicePdfPayloadSchema,
  invoicePdfResultSchema,
} from '@rgss/types'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { env } from './env'
import { renderInvoicePdf } from './render'
import { captureException } from './sentry'
import { buildPdfUrl, findPdfBytes, getPdfBytes, objectExists, putPdfIfAbsent } from './storage/r2'

const logger = createLogger({ service: 'invoicing', environment: env.NODE_ENV })

type SignedJson = { Variables: { signedJson: unknown } }

export const app = new Hono<SignedJson>()

const requireSignedJson = createMiddleware<SignedJson>(async (c, next) => {
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

    // 3. Parse the body for validation by the chosen route.
    try {
      c.set('signedJson', JSON.parse(rawText))
    } catch {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Body is not valid JSON' } }, 400)
    }
    await next()
  } catch (error) {
    logger.error('invoice PDF request failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    captureException(error)
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, 500)
  }
})

app.get('/healthz', (c) => c.json({ status: 'ok' }))

app.post('/v1/invoices', requireSignedJson, async (c) => {
  try {
    const parsed = invoicePdfPayloadSchema.safeParse(c.get('signedJson'))
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
    const key = invoicePdfObjectKey(payload.invoiceNumber, payload.issuedAt)
    const exists = await objectExists(key)
    const rendered = exists ? null : await renderInvoicePdf(payload)
    const created = rendered !== null && (await putPdfIfAbsent(key, rendered))
    const bytes = created ? rendered : await getPdfBytes(key)
    const reused = !created
    logger.info(reused ? 'invoice pdf reused' : 'invoice pdf rendered', {
      invoiceNumber: payload.invoiceNumber,
      key,
    })

    const result: InvoicePdfResult = {
      invoiceNumber: payload.invoiceNumber,
      pdfBase64: Buffer.from(bytes).toString('base64'),
      reused,
      ...(env.R2_INVOICE_ACCESS === 'private'
        ? { pdfObjectKey: key }
        : { pdfUrl: buildPdfUrl(key) }),
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

app.post('/v1/invoices/download', requireSignedJson, async (c) => {
  try {
    const request = invoicePdfDownloadSchema.safeParse(c.get('signedJson'))
    if (!request.success) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid invoice download request' } },
        400,
      )
    }
    const { invoiceNumber, issuedAt } = request.data
    const bytes = await findPdfBytes(invoicePdfObjectKey(invoiceNumber, issuedAt))
    if (!bytes) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Invoice PDF not found' } }, 404)
    }
    return c.body(new Uint8Array(bytes), 200, {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
    })
  } catch (error) {
    logger.error('invoice PDF download failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    captureException(error)
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, 500)
  }
})
