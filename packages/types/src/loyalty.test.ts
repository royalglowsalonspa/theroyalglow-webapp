/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : loyalty (types tests)
 * Scope        : Shared Types & Validation — unit tests
 *
 * Description  : Example-based unit tests for `redeemGemsSchema`, the request
 *                body contract for POST /api/gems/redeem. Exercises the
 *                idempotency-key bounds, the date/time formats, the non-empty
 *                id rules, and the deliberate ABSENCE of any client-supplied
 *                gems amount.
 *
 * Covers (Gems Redemption · Task 3.2)
 * - Rejects a missing / short (<8) / overlong (>64) idempotencyKey
 * - Rejects a malformed bookingDate or startTime
 * - Rejects empty serviceId / branchId
 * - Accepts a valid body and strips any client gems amount
 *
 * Validates: Requirements 6.2, 7.3, 11.4
 *
 * Tech Stack   : TypeScript, Zod, Vitest
 * Layer        : Shared Package (Test)
 *
 * Dependencies : vitest, ./loyalty
 *
 * Notes        : The schema must NEVER accept a gems amount — the charged cost
 *                is the server-read `gemsRequired` (Req 7.3). The final case
 *                asserts an extra `gemsRequired` field never survives parsing.
 ************************************************************/
import { describe, expect, it } from 'vitest'
import { redeemGemsSchema } from './loyalty'

const base = {
  serviceId: 'svc_1',
  branchId: 'br_1',
  bookingDate: '2026-06-10',
  startTime: '10:30',
  idempotencyKey: 'a1b2c3d4e5f6',
}

describe('redeemGemsSchema (Task 3.2)', () => {
  it('accepts a valid redemption body', () => {
    const result = redeemGemsSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.idempotencyKey).toBe(base.idempotencyKey)
    }
  })

  it('rejects a missing idempotencyKey (Req 6.2)', () => {
    const { idempotencyKey: _omitted, ...withoutKey } = base
    const result = redeemGemsSchema.safeParse(withoutKey)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.idempotencyKey).toBeDefined()
    }
  })

  it('rejects an idempotencyKey shorter than 8 characters (Req 6.2)', () => {
    // 7 chars — one below the lower bound.
    expect(redeemGemsSchema.safeParse({ ...base, idempotencyKey: 'a'.repeat(7) }).success).toBe(
      false,
    )
    // Exactly 8 chars — the boundary is inclusive.
    expect(redeemGemsSchema.safeParse({ ...base, idempotencyKey: 'a'.repeat(8) }).success).toBe(
      true,
    )
  })

  it('rejects an idempotencyKey longer than 64 characters (Req 6.2)', () => {
    // Exactly 64 chars — the boundary is inclusive.
    expect(redeemGemsSchema.safeParse({ ...base, idempotencyKey: 'a'.repeat(64) }).success).toBe(
      true,
    )
    // 65 chars — one above the upper bound.
    expect(redeemGemsSchema.safeParse({ ...base, idempotencyKey: 'a'.repeat(65) }).success).toBe(
      false,
    )
  })

  it('accepts a crypto.randomUUID()-shaped idempotencyKey', () => {
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    expect(redeemGemsSchema.safeParse({ ...base, idempotencyKey: uuid }).success).toBe(true)
  })

  it('rejects a malformed bookingDate', () => {
    expect(redeemGemsSchema.safeParse({ ...base, bookingDate: '10/06/2026' }).success).toBe(false)
    expect(redeemGemsSchema.safeParse({ ...base, bookingDate: '2026-6-10' }).success).toBe(false)
    expect(redeemGemsSchema.safeParse({ ...base, bookingDate: '' }).success).toBe(false)
  })

  it('rejects a malformed startTime', () => {
    expect(redeemGemsSchema.safeParse({ ...base, startTime: '9:5' }).success).toBe(false)
    expect(redeemGemsSchema.safeParse({ ...base, startTime: '10:30:00' }).success).toBe(false)
    expect(redeemGemsSchema.safeParse({ ...base, startTime: '' }).success).toBe(false)
  })

  it('rejects empty ids', () => {
    expect(redeemGemsSchema.safeParse({ ...base, serviceId: '' }).success).toBe(false)
    expect(redeemGemsSchema.safeParse({ ...base, branchId: '' }).success).toBe(false)
  })

  it('never surfaces a client-supplied gems amount (Req 7.3)', () => {
    const result = redeemGemsSchema.safeParse({ ...base, gemsRequired: 1, gemsSpent: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      // The parsed object carries exactly the five contract fields — any gems
      // amount the client invents is discarded, never trusted.
      expect(Object.keys(result.data).sort()).toEqual([
        'bookingDate',
        'branchId',
        'idempotencyKey',
        'serviceId',
        'startTime',
      ])
    }
  })
})
