/************************************************************
 * Module Name  : settlement/csv.test
 * Scope        : Business Logic — statement export (R10, MS-25)
 *
 * Description  : The CSV lists every entry with exact rupee amounts and ends
 *                with the statement's totals each way and its net, so it
 *                matches the statement; text can't run as a formula.
 ************************************************************/

import type { SettlementEntryView, SettlementStatementView } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import { rupeesPlain, settlementStatementCsv } from './csv'

const RS = { id: 'br_a', name: 'Rayasandra' }
const MH = { id: 'br_b', name: 'Mahadevapura, East' }

function entry(overrides: Partial<SettlementEntryView>): SettlementEntryView {
  return {
    id: 'e1',
    kind: 'membership_session',
    reversedKind: null,
    month: '2026-11',
    recordedAt: '2026-11-03T08:00:00.000Z',
    owingBranch: RS,
    owedBranch: MH,
    membershipNumber: 'RG-MEM-26-1-90872',
    bookingNumber: 'BK-MH-2611-S-12345-M',
    minutes: 60,
    gems: null,
    valuePaise: 100_000,
    gstSharePaise: 4_761,
    amountOwedPaise: 95_239,
    shareBps: 10_000,
    gemValuePaise: null,
    reversesEntryId: null,
    note: null,
    reversedByEntryId: null,
    ...overrides,
  }
}

const ENTRIES = [
  entry({}),
  entry({
    id: 'e2',
    kind: 'gems_redemption',
    membershipNumber: null,
    bookingNumber: 'BK-MH-2611-H-22222',
    minutes: null,
    gems: 500,
    valuePaise: 50_000,
    gstSharePaise: 0,
    amountOwedPaise: 50_000,
    gemValuePaise: 100,
  }),
  entry({
    id: 'e3',
    owingBranch: MH,
    owedBranch: RS,
    minutes: 30,
    valuePaise: 50_000,
    gstSharePaise: 2_380,
    amountOwedPaise: 47_620,
    note: '=HYPERLINK("x")',
  }),
]

const STATEMENT: SettlementStatementView = {
  id: 'st1',
  month: '2026-11',
  branchA: RS,
  branchB: MH,
  aOwesB: {
    membershipPaise: 95_239,
    membershipValuePaise: 100_000,
    membershipGstSharePaise: 4_761,
    gemsPaise: 50_000,
    totalPaise: 145_239,
  },
  bOwesA: {
    membershipPaise: 47_620,
    membershipValuePaise: 50_000,
    membershipGstSharePaise: 2_380,
    gemsPaise: 0,
    totalPaise: 47_620,
  },
  net: { payingBranch: RS, receivingBranch: MH, amountPaise: 97_619 },
  entryCount: 3,
  closedAt: '2026-12-01T18:45:00.000Z',
  paid: null,
  canMarkPaid: false,
  sameOwner: true,
}

/** Parse the simple CSV this module writes (quoted fields may hold commas). */
function parse(csv: string): string[][] {
  return csv
    .split('\r\n')
    .filter((line) => line !== '')
    .map((line) => {
      const fields: string[] = []
      let field = ''
      let quoted = false
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i] as string
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') {
            field += '"'
            i += 1
          } else if (ch === '"') {
            quoted = false
          } else {
            field += ch
          }
        } else if (ch === '"') {
          quoted = true
        } else if (ch === ',') {
          fields.push(field)
          field = ''
        } else {
          field += ch
        }
      }
      fields.push(field)
      return fields
    })
}

describe('rupeesPlain', () => {
  it.each([
    [95_239, '952.39'],
    [5, '0.05'],
    [0, '0.00'],
    [-95_239, '-952.39'],
    [10_000_000, '100000.00'],
  ])('writes %i paise as %s', (paise, expected) => {
    expect(rupeesPlain(paise)).toBe(expected)
  })

  it('refuses fractions of a paisa', () => {
    expect(() => rupeesPlain(1.5)).toThrow(RangeError)
  })
})

describe('settlementStatementCsv', () => {
  const rows = parse(settlementStatementCsv(STATEMENT, ENTRIES))

  it('names the pair and the month, then lists every entry', () => {
    expect(rows[0]).toEqual([
      'Settlement statement',
      'Rayasandra and Mahadevapura, East',
      '11/2026',
    ])
    expect(rows[1]?.[0]).toBe('Recorded on (IST)')
    expect(rows[2]).toEqual([
      '03/11/2026',
      'Membership session',
      'Rayasandra',
      'Mahadevapura, East',
      'RG-MEM-26-1-90872',
      'BK-MH-2611-S-12345-M',
      '60',
      '',
      '1000.00',
      '47.61',
      '100.00',
      '',
      '952.39',
      '',
    ])
    expect(rows[3]?.slice(7, 13)).toEqual(['500', '500.00', '0.00', '100.00', '1.00', '500.00'])
  })

  it('never lets text run as a formula', () => {
    expect(rows[4]?.at(-1)).toBe(`'=HYPERLINK("x")`)
  })

  it('matches the statement: entries each way add up to its totals, then the net (MS-25)', () => {
    const owed = (from: string) =>
      ENTRIES.filter((e) => e.owingBranch.name === from).reduce((s, e) => s + e.amountOwedPaise, 0)
    const total = (label: string) => rows.find((r) => r[0] === label)?.[1]

    expect(total('Rayasandra owes Mahadevapura, East: total owed')).toBe(
      rupeesPlain(owed('Rayasandra')),
    )
    expect(total('Mahadevapura, East owes Rayasandra: total owed')).toBe(
      rupeesPlain(owed('Mahadevapura, East')),
    )
    expect(total('Rayasandra owes Mahadevapura, East: memberships, GST share')).toBe('47.61')
    expect(total('Net: Rayasandra pays Mahadevapura, East')).toBe('976.19')
  })

  it('records the payment once paid', () => {
    const paid = parse(
      settlementStatementCsv(
        {
          ...STATEMENT,
          paid: {
            paidOn: '2026-12-05',
            reference: 'UTR 778899',
            internalTransfer: true,
            recordedByName: 'Owner',
            recordedAt: '2026-12-05T06:00:00.000Z',
          },
        },
        ENTRIES,
      ),
    )
    expect(paid.at(-1)).toEqual(['Paid on', '05/12/2026', 'UTR 778899', 'Internal transfer'])
  })

  it('labels a reversal with the kind it corrects', () => {
    const reversed = parse(
      settlementStatementCsv(STATEMENT, [
        entry({
          kind: 'reversal',
          reversedKind: 'membership_session',
          minutes: -60,
          valuePaise: -100_000,
          gstSharePaise: -4_761,
          amountOwedPaise: -95_239,
          reversesEntryId: 'e0',
          note: 'Complimentary session',
        }),
      ]),
    )
    expect(reversed[2]?.slice(1, 2)).toEqual(['Reversal (membership session)'])
    expect(reversed[2]?.slice(6, 13)).toEqual([
      '-60',
      '',
      '-1000.00',
      '-47.61',
      '100.00',
      '',
      '-952.39',
    ])
  })
})
