/************************************************************
 * Module Name  : jobs.month.test
 * Scope        : Unit tests — the month the GST summary closes
 *
 * Description  : The monthly GST summary runs at 19:30 UTC on the 1st (01:00
 *                IST on the 2nd) and rebuilds the previous IST month.
 *                previousIstMonthKey reads the month on the IST calendar, so
 *                the UTC evening before the 1st already counts as the new
 *                month, and January closes the previous December.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { previousIstMonthKey } from './jobs'

describe('previousIstMonthKey', () => {
  it.each([
    // 01:00 IST on 2 November 2026, when the job runs.
    ['2026-11-01T19:30:00.000Z', '2026-10'],
    // 00:00 IST on 1 November: already November in India.
    ['2026-10-31T18:30:00.000Z', '2026-10'],
    // 23:59 IST on 31 October: still October.
    ['2026-10-31T18:29:59.999Z', '2026-09'],
    ['2026-10-25T06:30:00.000Z', '2026-09'],
    // January closes the previous year's December.
    ['2027-01-01T19:30:00.000Z', '2026-12'],
    ['2026-12-31T18:30:00.000Z', '2026-12'],
    ['2026-03-15T12:00:00.000Z', '2026-02'],
  ])('at %s closes %s', (at, month) => {
    expect(previousIstMonthKey(new Date(at))).toBe(month)
  })
})
