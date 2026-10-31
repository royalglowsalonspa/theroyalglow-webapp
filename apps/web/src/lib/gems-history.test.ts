/************************************************************
 * Module Name  : gems-history.test
 * Scope        : Presentation — the customer's gems history (/gems)
 *
 * Description  : Each kind of transaction reads the right way round: earned
 *                and returned gems add, redeemed and expired gems take away,
 *                an adjustment follows its amount. A transaction's own
 *                description wins over its kind, except the internal marker
 *                older expiries carry.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { describeGemsTx } from './gems-history'

const tx = (type: string, gemsAmount: number, description: string | null = null) => ({
  type,
  gemsAmount,
  description,
})

describe('describeGemsTx', () => {
  it.each([
    ['earned', 12, '+', 12, 'Earned'],
    ['redeemed', 50, '-', 50, 'Redeemed'],
    ['returned', 50, '+', 50, 'Returned'],
    ['expired', -7, '-', 7, 'Expired'],
    ['adjusted', 10, '+', 10, 'Adjusted'],
    ['adjusted', -10, '-', 10, 'Adjusted'],
  ] as const)('shows %s %i as %s%i (%s)', (type, amount, sign, gems, label) => {
    expect(describeGemsTx(tx(type, amount))).toMatchObject({ sign, gems, text: label })
  })

  it("says what happened in the transaction's own words", () => {
    expect(
      describeGemsTx(tx('returned', 50, 'Returned: booking BK-RS-2610-H-12345 did not go ahead'))
        .text,
    ).toBe('Returned: booking BK-RS-2610-H-12345 did not go ahead')
    expect(describeGemsTx(tx('expired', -7, 'Expired: gems earned on 28/10/2025')).text).toBe(
      'Expired: gems earned on 28/10/2025',
    )
  })

  it('hides the internal marker older expiries carry', () => {
    expect(describeGemsTx(tx('expired', -7, 'expired:lt_abc123')).text).toBe('Expired')
  })

  it('keeps a description that merely starts like the marker on other kinds', () => {
    expect(describeGemsTx(tx('adjusted', 5, 'expired: restored by the salon')).text).toBe(
      'expired: restored by the salon',
    )
  })

  it('colours additions and deductions differently', () => {
    expect(describeGemsTx(tx('earned', 1)).tone).toBe('text-emerald-700')
    expect(describeGemsTx(tx('returned', 1)).tone).toBe('text-emerald-700')
    expect(describeGemsTx(tx('expired', -1)).tone).toBe('text-dusty-gray')
  })

  it('shows an unknown kind by its name, signed by its amount', () => {
    expect(describeGemsTx(tx('bonus', -3))).toEqual({
      text: 'bonus',
      sign: '-',
      tone: 'text-cocoa-dark',
      gems: 3,
    })
    expect(describeGemsTx(tx('constructor', 3)).text).toBe('constructor')
  })
})
