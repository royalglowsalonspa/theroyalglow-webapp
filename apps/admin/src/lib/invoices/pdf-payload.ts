/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : invoices/pdf-payload
 * Scope        : Invoice rendering — the render contract (multi-branch R6.1)
 *
 * Description  : Maps an invoice as stored into the fully-computed payload the
 *                invoicing service renders. Pure: no I/O.
 *
 * Responsibilities :
 * - buildPdfPayload(loaded) → InvoicePdfPayload from the stored issue facts
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation mapping
 *
 * Dependencies : @rgss/db/queries (type only), @rgss/types
 *
 * Notes        : Invoices issued before the snapshots existed (no tax point)
 *                render as before: the branch row as issuer, one SAC code and
 *                an even CGST/SGST split.
 ************************************************************/

import type { getInvoiceForPdf } from '@rgss/db/queries'
import type { InvoicePdfPayload } from '@rgss/types'

export type LoadedInvoice = NonNullable<Awaited<ReturnType<typeof getInvoiceForPdf>>>

// The one code invoices issued before per-line classification printed.
const LEGACY_SAC_CODE = '999721'

// Map the loaded invoice into the fully-computed render contract. Everything
// comes from what the invoice stored when it was issued (TX-05): its number,
// tax point, issuer snapshot, amounts, CGST/SGST and each line's SAC code and
// rate. Nothing is recalculated from today's branch or tax settings.
export function buildPdfPayload(loaded: LoadedInvoice): InvoicePdfPayload {
  const { invoice: inv, items, branch, customer, bookingNumber } = loaded
  const snapshotted = inv.taxPointAt !== null

  // The issuer as issued; an invoice from before the snapshot uses the branch.
  const addressLines = (
    snapshotted && inv.issuerAddress
      ? inv.issuerAddress.split('\n')
      : [
          branch.addressLine1,
          branch.addressLine2,
          `${branch.city}, ${branch.state} ${branch.pincode}`,
        ]
  ).filter((line): line is string => Boolean(line?.trim()))

  // Stored halves when the invoice has them; the even split older invoices used.
  const cgstPaise = inv.cgstPaise ?? Math.floor(inv.gstAmountPaise / 2)
  const sgstPaise = inv.sgstPaise ?? inv.gstAmountPaise - cgstPaise

  return {
    templateVersion: snapshotted ? 'v2' : 'v1',
    invoiceNumber: inv.invoiceNumber,
    issuedAt: (inv.taxPointAt ?? inv.createdAt).toISOString(),
    paymentMethod: inv.paymentMethod,
    bookingNumber: bookingNumber ?? undefined,
    taxReviewStatus: inv.taxReviewStatus ?? undefined,
    invoiceType: inv.invoiceType,
    seller: {
      name: (snapshotted ? inv.issuerName : null) ?? branch.name,
      legalName: snapshotted ? (inv.issuerLegalName ?? undefined) : undefined,
      addressLines,
      gstin: (snapshotted ? inv.issuerGstin : null) ?? undefined,
      phone: branch.phone ?? undefined,
      email: branch.email ?? undefined,
      // Older invoices carried one code for everything; newer ones per line.
      sacCode: snapshotted ? undefined : LEGACY_SAC_CODE,
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
      gemsCovered: item.serviceId !== null && item.serviceId === inv.gemsRedeemedServiceId,
      sacCode: item.sacCode,
      rateBps: item.rateBps,
      discountPaise: item.discountPaise,
      taxableValuePaise: item.taxableValuePaise,
      taxPaise: item.taxPaise,
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
