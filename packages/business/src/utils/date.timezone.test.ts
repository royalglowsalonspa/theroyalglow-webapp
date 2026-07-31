/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-02-2027 & Updated - 21-02-2027
 *
 * Project      : theroyalglow-webapp
 * Module Name  : date.timezone.test
 * Scope        : Business Logic — Utilities (test)
 *
 * Description  : Regression test pinning `formatDateIN` to the IST display zone
 *                on a UTC runtime. Timestamps are stored UTC and displayed IST
 *                (UTC+5:30, no DST), so a UTC instant in the 18:30–24:00 window
 *                is ALREADY the next IST calendar day. Rendering it in the host
 *                zone showed the PREVIOUS IST day on every UTC host (CI runners,
 *                containers), an off-by-one-day bug on invoices and bookings.
 *
 * Responsibilities :
 * - Force the host zone to UTC so the IST pin is the only thing under test
 * - Prove the host zone really changed (else the assertions are vacuous)
 * - Contrast the fixed output against a host-zone `Intl` format — the exact
 *   shape of the old implementation — so the bug stays documented
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 *
 * Dependencies : vitest, ./date
 *
 * Notes        : Complements `../__tests__/date.property.test.ts`, which
 *                quantifies the rollover under a pinned IST host zone. This file
 *                covers the opposite host zone, which is what production runs.
 ************************************************************/

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { formatDateIN } from './date'

// The pre-fix implementation: en-IN DD/MM/YYYY with NO `timeZone`, so Intl
// resolves the host zone. Kept here as the contrast case, never as the oracle.
function formatInHostZone(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

// 30 May 2026 23:15 UTC = 31 May 2026 04:45 IST.
const AFTER_IST_MIDNIGHT = new Date('2026-05-30T23:15:00.000Z')

describe('formatDateIN on a UTC runtime', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'UTC')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('really is running with a UTC host zone', () => {
    // Guard: if the runtime ignored the TZ stub every assertion below would be
    // satisfied by the host zone alone and prove nothing.
    expect(AFTER_IST_MIDNIGHT.getTimezoneOffset()).toBe(0)
    expect(formatInHostZone(AFTER_IST_MIDNIGHT)).toBe('30/05/2026')
  })

  it('renders the IST day, not the host-zone day', () => {
    // The host zone says 30/05; IST says 31/05. IST is the contract.
    expect(formatDateIN(AFTER_IST_MIDNIGHT)).toBe('31/05/2026')
    expect(formatDateIN(AFTER_IST_MIDNIGHT)).not.toBe(formatInHostZone(AFTER_IST_MIDNIGHT))
  })

  it('rolls over to the next IST day at exactly 18:30 UTC', () => {
    expect(formatDateIN(new Date('2026-05-30T18:29:59.999Z'))).toBe('30/05/2026')
    expect(formatDateIN(new Date('2026-05-30T18:30:00.000Z'))).toBe('31/05/2026')
    expect(formatDateIN(new Date('2026-05-30T23:59:59.999Z'))).toBe('31/05/2026')
  })

  it('rolls over month and year boundaries in IST', () => {
    expect(formatDateIN(new Date('2026-05-31T20:00:00.000Z'))).toBe('01/06/2026')
    expect(formatDateIN(new Date('2026-12-31T18:30:00.000Z'))).toBe('01/01/2027')
  })

  it('leaves instants before the IST cutoff on the same calendar day', () => {
    expect(formatDateIN(new Date('2026-05-30T00:00:00.000Z'))).toBe('30/05/2026')
    expect(formatDateIN(new Date('2026-05-30T12:00:00.000Z'))).toBe('30/05/2026')
  })
})
