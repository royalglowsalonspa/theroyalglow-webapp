import { z } from 'zod'

const amount = z.int().nonnegative()
const totals = z.object({
  lineCount: amount,
  taxablePaise: amount,
  cgstPaise: amount,
  sgstPaise: amount,
  gstPaise: amount,
})
const breakdownSchema = z.object({
  gst: z.object({
    groupCount: amount,
    groups: z
      .array(
        totals.extend({
          gstin: z.string().nullable(),
          reviewStatus: z.enum(['reviewed', 'provisional']),
        }),
      )
      .max(50),
    provisional: z.object({ invoiceCount: amount }),
    exceptionCount: amount,
  }),
})

export function readGstinDraftTotals(breakdown: unknown, gstin: string) {
  const parsed = breakdownSchema.safeParse(breakdown)
  if (!parsed.success) return null
  const { groups, groupCount, exceptionCount, provisional } = parsed.data.gst
  if (groupCount < groups.length) return null
  const provisionalCount = provisional.invoiceCount
  if (groupCount > groups.length) return { totals: null, exceptionCount, provisionalCount }

  const selected = { lineCount: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, gstPaise: 0 }
  for (const group of groups) {
    if (group.reviewStatus !== 'reviewed' || group.gstin !== gstin) continue
    if (group.cgstPaise + group.sgstPaise !== group.gstPaise) return null
    selected.lineCount += group.lineCount
    selected.taxablePaise += group.taxablePaise
    selected.cgstPaise += group.cgstPaise
    selected.sgstPaise += group.sgstPaise
    selected.gstPaise += group.gstPaise
  }
  if (!Object.values(selected).every(Number.isSafeInteger)) return null
  return { totals: selected, exceptionCount, provisionalCount }
}
