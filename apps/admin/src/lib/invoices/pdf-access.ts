/** The branch-authorized download path stored for an invoice in private R2. */
import { signRequest } from '@rgss/business'

export function invoicePdfDownloadPath(invoiceId: string): string {
  return `/api/billing/${encodeURIComponent(invoiceId)}/pdf`
}

export async function requestStoredInvoicePdf(
  serviceUrl: string,
  secret: string,
  invoiceNumber: string,
  issuedAt: string,
): Promise<Response> {
  const body = JSON.stringify({ invoiceNumber, issuedAt })
  const timestamp = Date.now()
  const signature = await signRequest({ secret, body, timestamp })
  return fetch(`${serviceUrl.replace(/\/+$/, '')}/v1/invoices/download`, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-rgss-timestamp': String(timestamp),
      'x-rgss-signature': signature,
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
}
