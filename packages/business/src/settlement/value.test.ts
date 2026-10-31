/************************************************************
 * Module Name  : settlement/value.test
 * Scope        : Unit tests — cross-branch settlement values (R10, MS-20,
 *                MS-21, ST-01, ST-05, ST-08)
 *
 * Description  : The specification the database's SQL is checked against:
 *                - a session is worth its share of the price paid, its GST
 *                  share follows the purchase GST, and every minute used adds
 *                  up to exactly the price and the GST;
 *                - the performing branch is owed the value without GST, at
 *                  the share rate;
 *                - gems are worth the value per gem; no GST;
 *                - a pair's month nets to one payment, and the branches' net
 *                  positions add up to zero.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  gemsEntryValue,
  istMonthOf,
  membershipSessionValue,
  type NettableEntry,
  netPair,
  nextMonth,
  shareOf,
} from './value'

// ₹10,000.00 for 10 hours with 5% GST included: taxable ₹9,523.81, GST ₹476.19.
const TEN_HOURS = { pricePaise: 1_000_000, gstPaise: 47_619, totalMinutes: 600, shareBps: 10_000 }

/** Each session of `minutes` until the membership is used up. */
function useUp(base: Omit<Parameters<typeof membershipSessionValue>[0], 'usedBeforeMinutes'>) {
  const sessions = []
  for (let used = 0; used < base.totalMinutes; used += base.minutes) {
    sessions.push(membershipSessionValue({ ...base, usedBeforeMinutes: used }))
  }
  return sessions
}

describe('membershipSessionValue — a session at its membership’s own rate', () => {
  it('values the first hour of ₹10,000 for 10 hours at ₹1,000.00, owing ₹952.39 (MS-20)', () => {
    expect(membershipSessionValue({ ...TEN_HOURS, usedBeforeMinutes: 0, minutes: 60 })).toEqual({
      valuePaise: 100_000n,
      gstSharePaise: 4_761n,
      amountOwedPaise: 95_239n,
    })
  })

  it('values every later hour at ₹1,000.00 with ₹47.62 GST, owing ₹952.38 (MS-20)', () => {
    const [, ...later] = useUp({ ...TEN_HOURS, minutes: 60 })
    expect(later).toHaveLength(9)
    for (const session of later) {
      expect(session).toEqual({
        valuePaise: 100_000n,
        gstSharePaise: 4_762n,
        amountOwedPaise: 95_238n,
      })
    }
  })

  it('adds up to the price, the GST and the taxable value once every minute is used', () => {
    const sessions = useUp({ ...TEN_HOURS, minutes: 60 })
    const sum = (pick: (s: (typeof sessions)[number]) => bigint) =>
      sessions.reduce((total, s) => total + pick(s), 0n)
    expect(sum((s) => s.valuePaise)).toBe(1_000_000n)
    expect(sum((s) => s.gstSharePaise)).toBe(47_619n)
    expect(sum((s) => s.amountOwedPaise)).toBe(952_381n)
  })

  it('gives ₹10,000 for 9 hours eight values of ₹1,111.11 and one of ₹1,111.12 (MS-21)', () => {
    const sessions = useUp({
      pricePaise: 1_000_000,
      gstPaise: 47_619,
      totalMinutes: 540,
      minutes: 60,
      shareBps: 10_000,
    })
    expect(sessions.map((s) => s.valuePaise)).toEqual([
      ...Array.from({ length: 8 }, () => 111_111n),
      111_112n,
    ])
    expect(sessions.reduce((t, s) => t + s.gstSharePaise, 0n)).toBe(47_619n)
  })

  it('never overflows: ₹1,00,000 for 100 hours in one session', () => {
    expect(
      membershipSessionValue({
        pricePaise: 10_000_000,
        gstPaise: 476_190,
        totalMinutes: 6_000,
        usedBeforeMinutes: 5_940,
        minutes: 60,
        shareBps: 10_000,
      }).valuePaise,
    ).toBe(100_000n)
  })

  it('pays only the share rate of the amount', () => {
    expect(
      membershipSessionValue({ ...TEN_HOURS, shareBps: 5_000, usedBeforeMinutes: 0, minutes: 60 })
        .amountOwedPaise,
    ).toBe(47_619n)
    expect(shareOf(95_239n, 0)).toBe(0n)
  })

  it('refuses minutes beyond the purchase and impossible inputs', () => {
    expect(() =>
      membershipSessionValue({ ...TEN_HOURS, usedBeforeMinutes: 570, minutes: 60 }),
    ).toThrow(RangeError)
    expect(() =>
      membershipSessionValue({ ...TEN_HOURS, usedBeforeMinutes: 0, minutes: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      membershipSessionValue({
        ...TEN_HOURS,
        gstPaise: 2_000_000,
        usedBeforeMinutes: 0,
        minutes: 60,
      }),
    ).toThrow(RangeError)
    expect(() => shareOf(1n, 10_001)).toThrow(RangeError)
  })

  it('adds up exactly for any membership and any sessions (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 2_800 }),
        fc.array(fc.integer({ min: 1, max: 240 }), { minLength: 1, maxLength: 20 }),
        (pricePaise, gstBps, sessionMinutes) => {
          const totalMinutes = sessionMinutes.reduce((t, m) => t + m, 0)
          const gstPaise = Math.floor((pricePaise * gstBps) / (10_000 + gstBps))
          let used = 0
          let value = 0n
          let gst = 0n
          for (const minutes of sessionMinutes) {
            const s = membershipSessionValue({
              pricePaise,
              gstPaise,
              totalMinutes,
              usedBeforeMinutes: used,
              minutes,
              shareBps: 10_000,
            })
            expect(s.valuePaise).toBeGreaterThanOrEqual(0n)
            expect(s.gstSharePaise).toBeGreaterThanOrEqual(0n)
            // Both are floor differences, so on a membership worth under a
            // paisa a minute one session's GST share can pass its value by a
            // paisa; never by more, and the totals stay exact.
            expect(s.gstSharePaise - s.valuePaise).toBeLessThanOrEqual(1n)
            used += minutes
            value += s.valuePaise
            gst += s.gstSharePaise
          }
          expect(value).toBe(BigInt(pricePaise))
          expect(gst).toBe(BigInt(gstPaise))
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('gemsEntryValue — gems spent at another branch', () => {
  it('owes ₹500.00 for 500 gems at ₹1.00 and 100% (ST-01)', () => {
    expect(gemsEntryValue({ gems: 500, gemValuePaise: 100, shareBps: 10_000 })).toEqual({
      valuePaise: 50_000n,
      gstSharePaise: 0n,
      amountOwedPaise: 50_000n,
    })
  })

  it('uses the value and share it is given (ST-05)', () => {
    expect(gemsEntryValue({ gems: 500, gemValuePaise: 150, shareBps: 8_000 }).amountOwedPaise).toBe(
      60_000n,
    )
  })
})

describe('netPair — one payment per pair and month (ST-07, ST-08)', () => {
  const entries: NettableEntry[] = [
    {
      owingBranchId: 'b_rs',
      owedBranchId: 'b_mh',
      kind: 'membership_session',
      amountOwedPaise: 95_239n,
    },
    {
      owingBranchId: 'b_rs',
      owedBranchId: 'b_mh',
      kind: 'gems_redemption',
      amountOwedPaise: 50_000n,
    },
    {
      owingBranchId: 'b_mh',
      owedBranchId: 'b_rs',
      kind: 'membership_session',
      amountOwedPaise: 95_238n,
    },
    // Internal and other pairs' entries don't count.
    {
      owingBranchId: 'b_rs',
      owedBranchId: 'b_rs',
      kind: 'membership_session',
      amountOwedPaise: 95_238n,
    },
    {
      owingBranchId: 'b_rs',
      owedBranchId: 'b_xx',
      kind: 'gems_redemption',
      amountOwedPaise: 9_999n,
    },
  ]

  it('totals each way by kind and nets to who pays whom', () => {
    expect(netPair('b_mh', 'b_rs', entries)).toEqual({
      branchAId: 'b_mh',
      branchBId: 'b_rs',
      aOwesB: { membershipPaise: 95_238n, gemsPaise: 0n },
      bOwesA: { membershipPaise: 95_239n, gemsPaise: 50_000n },
      payingBranchId: 'b_rs',
      receivingBranchId: 'b_mh',
      netPaise: 50_001n,
      entryCount: 3,
    })
  })

  it('counts a reversal against the kind it reverses', () => {
    const reversed = netPair('b_mh', 'b_rs', [
      ...entries,
      {
        owingBranchId: 'b_rs',
        owedBranchId: 'b_mh',
        kind: 'reversal',
        reversedKind: 'gems_redemption',
        amountOwedPaise: -50_000n,
      },
    ])
    expect(reversed.bOwesA.gemsPaise).toBe(0n)
    expect(reversed.netPaise).toBe(1n)
  })

  it('nets to nothing when both sides match', () => {
    const even = netPair('b_mh', 'b_rs', [
      {
        owingBranchId: 'b_rs',
        owedBranchId: 'b_mh',
        kind: 'gems_redemption',
        amountOwedPaise: 700n,
      },
      {
        owingBranchId: 'b_mh',
        owedBranchId: 'b_rs',
        kind: 'gems_redemption',
        amountOwedPaise: 700n,
      },
    ])
    expect(even).toMatchObject({ payingBranchId: null, receivingBranchId: null, netPaise: 0n })
  })

  it('needs the pair in id order', () => {
    expect(() => netPair('b_rs', 'b_mh', entries)).toThrow(RangeError)
  })

  it('gives net positions that add up to zero across all pairs (ST-08, property)', () => {
    const branches = ['b_1', 'b_2', 'b_3', 'b_4']
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            owing: fc.constantFrom(...branches),
            owed: fc.constantFrom(...branches),
            gems: fc.boolean(),
            amount: fc.integer({ min: 0, max: 1_000_000 }),
          }),
          { maxLength: 40 },
        ),
        (raw) => {
          const all: NettableEntry[] = raw.map((e) => ({
            owingBranchId: e.owing,
            owedBranchId: e.owed,
            kind: e.gems ? 'gems_redemption' : 'membership_session',
            amountOwedPaise: BigInt(e.amount),
          }))
          const position = new Map(branches.map((b) => [b, 0n]))
          for (let i = 0; i < branches.length; i += 1) {
            for (let j = i + 1; j < branches.length; j += 1) {
              const a = branches[i] as string
              const b = branches[j] as string
              const pair = netPair(a, b, all)
              if (pair.payingBranchId && pair.receivingBranchId) {
                position.set(
                  pair.payingBranchId,
                  (position.get(pair.payingBranchId) ?? 0n) - pair.netPaise,
                )
                position.set(
                  pair.receivingBranchId,
                  (position.get(pair.receivingBranchId) ?? 0n) + pair.netPaise,
                )
              }
            }
          }
          expect([...position.values()].reduce((t, v) => t + v, 0n)).toBe(0n)
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('months', () => {
  it('places an entry in its IST calendar month', () => {
    // 23:59 IST on 31/10 is still October; 00:00 IST on 1/11 is November.
    expect(istMonthOf(new Date('2026-10-31T18:29:00.000Z'))).toBe('2026-10')
    expect(istMonthOf(new Date('2026-10-31T18:30:00.000Z'))).toBe('2026-11')
  })

  it('steps to the next month, across the year', () => {
    expect(nextMonth('2026-11')).toBe('2026-12')
    expect(nextMonth('2026-12')).toBe('2027-01')
  })
})
