/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : api/invoice-tax
 * Scope        : API Infrastructure — tax for an invoice (multi-branch R6.4)
 *
 * Description  : Loads a branch's tax versions, the invoicing mode and the
 *                SAC codes of catalogue services, then works out an invoice's
 *                tax with @rgss/business. Shared by checkout, membership sales
 *                and membership sessions so all three bill the same way.
 *
 * Responsibilities :
 * - invoiceTaxFor(branch, taxPoint, lines, discount) → PreparedInvoiceTax
 * - serviceSacCodes(serviceIds): each service's code, or a 409 naming the
 *   services without one
 *
 * Tech Stack   : TypeScript, Next.js 16
 * Layer        : API Infrastructure (orchestration)
 *
 * Dependencies : @rgss/business, @rgss/db/queries, @rgss/errors
 *
 * Notes        : There is no fallback rate: a missing version or SAC code is
 *                an actionable 409 before anything is written.
 ************************************************************/

import { type InvoiceLineInput, type PreparedInvoiceTax, prepareInvoiceTax } from '@rgss/business'
import { getBranchTaxVersions, getInvoicingSetting, getServiceSacCodes } from '@rgss/db/queries'
import { AppError, ERROR_CODES } from '@rgss/errors'

/** The branch fields an invoice's issuer checks need. */
export type InvoicingBranch = {
  id: string
  name: string
  legalName: string | null
  gstin: string | null
}

/** The invoice's tax, from the branch's rates in force at `taxPoint`. */
export async function invoiceTaxFor(params: {
  branch: InvoicingBranch
  taxPoint: Date
  lines: InvoiceLineInput[]
  discountPaise?: number
  /** The lines that share the discount (an offer's covered lines); every line when absent. */
  discountableLines?: readonly boolean[]
}): Promise<PreparedInvoiceTax> {
  const [versions, invoicing] = await Promise.all([
    getBranchTaxVersions(params.branch.id),
    getInvoicingSetting(),
  ])
  return prepareInvoiceTax({
    versions,
    branch: params.branch,
    liveInvoicing: invoicing.live,
    taxPoint: params.taxPoint,
    lines: params.lines,
    discountPaise: params.discountPaise ?? 0,
    ...(params.discountableLines ? { discountableLines: params.discountableLines } : {}),
  })
}

/**
 * Each service's SAC code. Throws an actionable 409 naming the services that
 * have no classification (neither their own nor their category's).
 */
export async function serviceSacCodes(
  services: readonly { serviceId: string; name: string }[],
): Promise<Map<string, string>> {
  const codes = await getServiceSacCodes(services.map((s) => s.serviceId))
  const resolved = new Map<string, string>()
  const missing: string[] = []
  for (const s of services) {
    const code = codes.get(s.serviceId)
    if (code) {
      resolved.set(s.serviceId, code)
    } else if (!missing.includes(s.name)) {
      missing.push(s.name)
    }
  }
  if (missing.length > 0) {
    throw new AppError({
      code: ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE,
      message: `${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no tax classification (SAC code). Set it on the service or its category in the CMS.`,
      statusCode: 409,
    })
  }
  return resolved
}
