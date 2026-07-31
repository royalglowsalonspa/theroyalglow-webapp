/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : date.property.test
 * Scope        : Property-based test — Indian date formatting
 *
 * Property     : Property 4: Indian Date Formatting Round-Trip
 * Validates    : Requirements 12.3
 *
 * Description  : fast-check + Vitest property tests for formatDateIN
 *                (packages/business/src/utils/date.ts). Dates are displayed
 *                DD/MM/YYYY via the en-IN locale, and timestamps are stored UTC
 *                but displayed IST (UTC+5:30, no DST), so the day-boundary
 *                rollover is the case that matters most.
 *
 * Responsibilities :
 * - Output ALWAYS matches the DD/MM/YYYY pattern (zero-padded, day first)
 * - The day/month/year components ALWAYS match the input calendar date
 * - The formatted string round-trips: reformatting the parsed components
 *   reproduces the same string
 * - Under an IST display zone, a UTC instant at or after 18:30 renders the
 *   NEXT IST calendar day (the classic off-by-one-day bug)
 *
 * Features / Functionality :
 * - The IST reference date is derived arithmetically from a fixed +05:30 offset
 *   (India has no DST), independent of Intl, so the oracle cannot share a bug
 *   with the implementation
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../utils/date
 *
 * Notes        : Implements design Correctness Property 4 only.
 *                `formatDateIN` pins Intl to Asia/Kolkata, so its output no
 *                longer depends on the host zone. Both groups still stub `TZ` to
 *                Asia/Kolkata because they construct their inputs from LOCAL
 *                calendar components (`new Date(y, m, d, 12, …)`); pinning the
 *                host zone keeps the input side deterministic too. The UTC-host
 *                case — the one production runs — is covered by
 *                `../utils/date.timezone.test.ts`.
 ************************************************************/

import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { formatDateIN } from '../utils/date'

const DD_MM_YYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/

// India Standard Time is a constant UTC+05:30 — no DST, so fixed-offset
// arithmetic is exact.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

type Civil = { day: number; month: number; year: number }

function parseOutput(output: string): Civil {
  const match = DD_MM_YYYY.exec(output)
  if (!match) {
    throw new Error(`output is not DD/MM/YYYY: ${output}`)
  }
  return {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
  }
}

/** The IST calendar date of a UTC instant, computed without Intl. */
function istCivil(date: Date): Civil {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function render(civil: Civil): string {
  return `${pad2(civil.day)}/${pad2(civil.month)}/${String(civil.year).padStart(4, '0')}`
}

// Calendar components, kept inside the 4-digit-year contract of DD/MM/YYYY.
const civilArb = fc.record({
  year: fc.integer({ min: 1000, max: 9999 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
})

// India only adopted a uniform +05:30 in 1942 — the tz database applies Madras
// local mean time (+05:53:28) to earlier instants. The fixed-offset oracle is
// therefore only valid from the modern era onwards, which is the whole domain of
// a stored booking/invoice timestamp.
const IST_ERA_MIN = new Date('1970-01-01T00:00:00.000Z')
const IST_ERA_MAX = new Date('2199-12-31T00:00:00.000Z')

// Derived from a real instant so every valid month end (28/29/30/31) appears.
const istEraCivilArb: fc.Arbitrary<Civil> = fc
  .date({ min: IST_ERA_MIN, max: IST_ERA_MAX, noInvalidDate: true })
  .map((date) => ({
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  }))

// ---------------------------------------------------------------------------
// Property 4: Indian Date Formatting Round-Trip — host-zone independent
// ---------------------------------------------------------------------------

describe('Property 4: Indian Date Formatting Round-Trip', () => {
  // Inputs below are built from LOCAL calendar components, so the host zone must
  // match the IST display zone for "local noon" to be IST noon.
  beforeAll(() => {
    vi.stubEnv('TZ', 'Asia/Kolkata')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('always renders the calendar date as zero-padded DD/MM/YYYY', () => {
    fc.assert(
      fc.property(civilArb, (civil) => {
        // Local noon — far from any midnight boundary in the display zone.
        const date = new Date(civil.year, civil.month - 1, civil.day, 12, 0, 0)
        const output = formatDateIN(date)

        expect(output).toMatch(DD_MM_YYYY)
        // Day first, month second — never the en-US ordering.
        expect(parseOutput(output)).toEqual(civil)
        expect(output).toBe(render(civil))
      }),
      { numRuns: 500 },
    )
  })

  it('round-trips: reformatting the parsed components reproduces the string', () => {
    fc.assert(
      fc.property(civilArb, (civil) => {
        const first = formatDateIN(new Date(civil.year, civil.month - 1, civil.day, 12, 0, 0))
        const parsed = parseOutput(first)
        const second = formatDateIN(new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0))

        expect(second).toBe(first)
      }),
      { numRuns: 500 },
    )
  })

  it('zero-pads single-digit days and months, and handles month ends', () => {
    expect(formatDateIN(new Date(2026, 0, 5, 12, 0, 0))).toBe('05/01/2026')
    expect(formatDateIN(new Date(2026, 0, 31, 12, 0, 0))).toBe('31/01/2026')
    expect(formatDateIN(new Date(2026, 3, 30, 12, 0, 0))).toBe('30/04/2026')
    // 2028 is a leap year.
    expect(formatDateIN(new Date(2028, 1, 29, 12, 0, 0))).toBe('29/02/2028')
  })
})

// ---------------------------------------------------------------------------
// Property 4 (cont.): UTC instants displayed in IST
// ---------------------------------------------------------------------------

describe('Property 4: Indian Date Formatting Round-Trip — UTC stored, IST displayed', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'Asia/Kolkata')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('honours the pinned IST display zone', () => {
    // Guard: if the runtime ignored the TZ pin the rollover assertions below
    // would be meaningless, so fail here with a clear reason instead.
    expect(new Date(Date.UTC(2026, 4, 30, 12, 0, 0)).getTimezoneOffset()).toBe(-330)
  })

  it('renders the IST calendar date for any stored UTC instant', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('1970-01-01T00:00:00.000Z'),
          max: new Date('2199-12-31T23:59:59.999Z'),
          noInvalidDate: true,
        }),
        (instant) => {
          const output = formatDateIN(instant)

          expect(output).toMatch(DD_MM_YYYY)
          expect(parseOutput(output)).toEqual(istCivil(instant))
        },
      ),
      { numRuns: 500 },
    )
  })

  it('rolls over to the next IST day at 18:30 UTC', () => {
    fc.assert(
      fc.property(istEraCivilArb, (civil) => {
        const beforeCutoff = new Date(Date.UTC(civil.year, civil.month - 1, civil.day, 18, 29, 59))
        const atCutoff = new Date(Date.UTC(civil.year, civil.month - 1, civil.day, 18, 30, 0))
        const endOfUtcDay = new Date(Date.UTC(civil.year, civil.month - 1, civil.day, 23, 59, 59))

        // 18:29:59Z is still the same IST calendar day.
        expect(formatDateIN(beforeCutoff)).toBe(render(civil))
        // 18:30:00Z onwards is already tomorrow in IST. Date.UTC normalises the
        // month/year rollover, so day 28 + 1 in a short February is handled.
        const nextUtcDay = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + 1))
        const nextDay: Civil = {
          day: nextUtcDay.getUTCDate(),
          month: nextUtcDay.getUTCMonth() + 1,
          year: nextUtcDay.getUTCFullYear(),
        }
        expect(formatDateIN(atCutoff)).toBe(render(nextDay))
        expect(formatDateIN(endOfUtcDay)).toBe(render(nextDay))
      }),
      { numRuns: 300 },
    )
  })

  it('rolls over month and year boundaries in IST', () => {
    expect(formatDateIN(new Date('2026-12-31T18:29:59.000Z'))).toBe('31/12/2026')
    expect(formatDateIN(new Date('2026-12-31T18:30:00.000Z'))).toBe('01/01/2027')
    expect(formatDateIN(new Date('2026-05-31T19:00:00.000Z'))).toBe('01/06/2026')
    expect(formatDateIN(new Date('2026-05-30T18:30:00.000Z'))).toBe('31/05/2026')
  })
})
