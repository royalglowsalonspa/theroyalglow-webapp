import { invoiceFileStem } from '@rgss/business'
import { getInvoiceById } from '@rgss/db/queries'
import { notFound, serviceUnavailable } from '@rgss/errors'
import { env } from '@/env'
import { requireBranchRole } from '@/lib/api/branch-context'
import { withErrorHandler } from '@/lib/api/error-handler'
import { invoicePdfDownloadPath, requestStoredInvoicePdf } from '@/lib/invoices/pdf-access'

export const GET = withErrorHandler(
  async (_req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params
    const invoice = await getInvoiceById(id, ctx.branch.id)

    // Only invoices with a confirmed private PDF belong to this route. The
    // invoice number and issue timestamp come from the branch's invoice row.
    if (!invoice || invoice.pdfUrl !== invoicePdfDownloadPath(id)) {
      throw notFound('Invoice PDF not found.')
    }
    const serviceUrl = env.INVOICING_SERVICE_URL
    const secret = env.INVOICE_PDF_HMAC_SECRET
    if (!serviceUrl || !secret) throw serviceUnavailable('invoice PDF')

    const pdf = await requestStoredInvoicePdf(
      serviceUrl,
      secret,
      invoice.invoiceNumber,
      (invoice.taxPointAt ?? invoice.createdAt).toISOString(),
    ).catch(() => {
      throw serviceUnavailable('invoice PDF')
    })

    if (pdf.status === 404) throw notFound('Invoice PDF not found.')
    if (!pdf.ok || !pdf.body || pdf.headers.get('content-type') !== 'application/pdf') {
      throw serviceUnavailable('invoice PDF')
    }

    return new Response(pdf.body, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${invoiceFileStem(invoice.invoiceNumber)}.pdf"`,
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  },
)
