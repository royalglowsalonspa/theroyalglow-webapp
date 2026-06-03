/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : gst
 * Scope        : Business Logic — Invoicing
 *
 * Description  : GST calculation utility for splitting inclusive
 *                prices into base + CGST + SGST (intra-state Karnataka).
 *
 * Responsibilities :
 * - Back-calculate taxable base from GST-inclusive price
 * - Split GST into equal CGST/SGST halves
 * - Maintain integer paise precision (no floating point)
 *
 * Features / Functionality :
 * - splitGST(inclusivePaise) → { basePaise, gstPaise, cgstPaise, sgstPaise }
 * - Exact reconstruction: base + gst === original amount
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        :
 * - GST rate: 18% (SAC 999721 — beauty/wellness services)
 * - All prices stored as GST-inclusive in DB
 ************************************************************/
const GST_RATE = 0.18

// Prices are stored GST-inclusive (18%, SAC 999721). Back-calculate the taxable
// base and split GST into equal CGST/SGST halves (intra-state, Karnataka). All
// integer paise math — the base is rounded, GST is the remainder so base + gst
// always reconstructs the original inclusive amount exactly.
export function splitGST(inclusivePaise: number): {
  basePaise: number
  gstPaise: number
  cgstPaise: number
  sgstPaise: number
  totalPaise: number
} {
  const basePaise = Math.round(inclusivePaise / (1 + GST_RATE))
  const gstPaise = inclusivePaise - basePaise
  const cgstPaise = Math.floor(gstPaise / 2)
  const sgstPaise = gstPaise - cgstPaise
  return { basePaise, gstPaise, cgstPaise, sgstPaise, totalPaise: inclusivePaise }
}
