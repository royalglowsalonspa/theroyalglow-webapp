import { invoiceEventIdSchema } from '@rgss/types'
import { z } from 'zod'

export const invoiceId = invoiceEventIdSchema
export const lookupValue = z.string().trim().min(1).max(100)

export interface InvoiceRecord {
  id: string
  branch_id: string
  invoice_number: string
  issued_at: string
  total_paise: number
  snapshot_hash: string
  snapshot_key: string
}

export function pdfKey(invoice: InvoiceRecord): string {
  return `pdf-cache/${invoice.id}/${invoice.snapshot_hash}.pdf`
}

export async function snapshotHash(body: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
