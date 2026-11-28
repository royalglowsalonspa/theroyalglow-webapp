import { renderToBuffer } from '@react-pdf/renderer'
/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/render
 * Scope        : Rendering
 *
 * Description  : Renders a fully-computed invoice payload into PDF bytes using
 *                @react-pdf/renderer's renderToBuffer. Pure transform — no I/O,
 *                no money math.
 ************************************************************/
import type { InvoicePdfPayload } from '@rgss/types'
import { InvoiceDocument } from './template/InvoiceDocument'

// Render the invoice document to PDF bytes (vector, no Chromium).
export async function renderInvoicePdf(payload: InvoicePdfPayload): Promise<Uint8Array> {
  const buffer = await renderToBuffer(InvoiceDocument(payload))
  return new Uint8Array(buffer)
}
