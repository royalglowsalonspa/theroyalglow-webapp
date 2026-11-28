import { describe, expect, test } from 'bun:test'
import { readGstinDraftTotals } from '../src/gstin-close-summary'

const gstin = '29AAECY8753K1Z3'
const group = (gstin: string | null, reviewStatus = 'reviewed') => ({
  gstin,
  reviewStatus,
  lineCount: 2,
  taxablePaise: 10000,
  cgstPaise: 900,
  sgstPaise: 900,
  gstPaise: 1800,
})

describe('frozen draft GSTIN totals', () => {
  test('only includes reviewed groups for the selected GSTIN', () => {
    const groups = [
      group(gstin),
      group(gstin),
      group('other'),
      group(null),
      group(gstin, 'provisional'),
    ]
    expect(
      readGstinDraftTotals(
        { gst: { groups, groupCount: 5, exceptionCount: 1, provisional: { invoiceCount: 1 } } },
        gstin,
      ),
    ).toEqual({
      totals: {
        lineCount: 4,
        taxablePaise: 20000,
        cgstPaise: 1800,
        sgstPaise: 1800,
        gstPaise: 3600,
      },
      exceptionCount: 1,
      provisionalCount: 1,
    })
  })

  test('preserves a known zero separately from unavailable or truncated groups', () => {
    const gst = { groups: [], groupCount: 0, exceptionCount: 0, provisional: { invoiceCount: 0 } }
    expect(readGstinDraftTotals({ gst }, gstin)?.totals?.lineCount).toBe(0)
    expect(readGstinDraftTotals({ gst: { ...gst, groupCount: 51 } }, gstin)?.totals).toBeNull()
    expect(readGstinDraftTotals({}, gstin)).toBeNull()
  })

  test('rejects disagreeing tax components and an unsafe aggregate', () => {
    const gst = { exceptionCount: 0, provisional: { invoiceCount: 0 } }
    expect(
      readGstinDraftTotals(
        { gst: { ...gst, groupCount: 1, groups: [{ ...group(gstin), gstPaise: 1 }] } },
        gstin,
      ),
    ).toBeNull()
    expect(
      readGstinDraftTotals(
        {
          gst: {
            ...gst,
            groupCount: 2,
            groups: [{ ...group(gstin), taxablePaise: Number.MAX_SAFE_INTEGER }, group(gstin)],
          },
        },
        gstin,
      ),
    ).toBeNull()
  })
})
