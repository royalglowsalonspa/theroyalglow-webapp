/** The branch-authorized download path stored for an invoice in private R2. */
export function invoicePdfDownloadPath(invoiceId: string): string {
  return `/api/billing/${encodeURIComponent(invoiceId)}/pdf`
}
