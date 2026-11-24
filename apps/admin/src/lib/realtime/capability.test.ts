/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : capability.test
 * Scope        : Property-based tests for the pure Ably capability builder
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                realtime/capability.ts`. An admin token is subscribe-only and
 *                covers exactly the channels of the branches it is built for
 *                (multi-branch R2.6, design §3): never another branch's
 *                channel, never a cross-branch wildcard.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  adminChannelPatternsForBranch,
  buildAdminAblyCapability,
  isChannelSafeBranchId,
} from './capability'
import {
  adminBookingsChannel,
  adminLeaveChannel,
  adminScheduleChannel,
  bookingChannel,
} from './channels'

// A model of Ably's matching for the resources we issue: a trailing `*`
// segment matches the rest of the name; anything else matches exactly.
function grants(pattern: string, channel: string): boolean {
  if (pattern.endsWith(':*')) {
    return channel.startsWith(pattern.slice(0, -1))
  }
  return pattern === channel
}

function allows(capability: Record<string, string[]>, channel: string): boolean {
  return Object.keys(capability).some((pattern) => grants(pattern, channel))
}

const branchId = fc.stringMatching(/^[A-Za-z0-9_-]{1,24}$/)
const isoDate = fc
  .tuple(
    fc.integer({ min: 2026, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
const bookingId = fc.stringMatching(/^[A-Za-z0-9_-]{6,21}$/)

describe('buildAdminAblyCapability', () => {
  it('grants only subscribe, on every channel pattern', () => {
    fc.assert(
      fc.property(fc.uniqueArray(branchId, { minLength: 1, maxLength: 4 }), (branchIds) => {
        const capability = buildAdminAblyCapability(branchIds)
        for (const ops of Object.values(capability)) {
          expect(ops).toEqual(['subscribe'])
        }
      }),
    )
  })

  it('covers exactly the four patterns of each branch it is built for', () => {
    fc.assert(
      fc.property(fc.uniqueArray(branchId, { minLength: 1, maxLength: 4 }), (branchIds) => {
        const keys = new Set(Object.keys(buildAdminAblyCapability(branchIds)))
        expect(keys).toEqual(new Set(branchIds.flatMap(adminChannelPatternsForBranch)))
      }),
    )
  })

  it('never issues a cross-branch wildcard', () => {
    const capability = buildAdminAblyCapability(['branch_rs', 'branch_mh'])
    for (const legacy of ['booking:*', 'admin:bookings:*', 'admin:schedule:*', 'admin:*', '*']) {
      expect(capability).not.toHaveProperty(legacy)
    }
    expect(capability).not.toHaveProperty('admin:leave')
  })

  it('lets a branch’s token read its own channels and no other branch’s', () => {
    fc.assert(
      fc.property(branchId, branchId, isoDate, bookingId, (mine, other, date, booking) => {
        fc.pre(mine !== other)
        const capability = buildAdminAblyCapability([mine])

        for (const channel of [
          adminBookingsChannel(mine),
          adminScheduleChannel(mine, date),
          adminLeaveChannel(mine),
          bookingChannel(mine, booking),
        ]) {
          expect(allows(capability, channel)).toBe(true)
        }
        for (const channel of [
          adminBookingsChannel(other),
          adminScheduleChannel(other, date),
          adminLeaveChannel(other),
          bookingChannel(other, booking),
        ]) {
          // A prefix of `mine` must not reach `other` either: the `:` after the
          // branch id stops `branch_r` from matching `branch_rs`.
          expect(allows(capability, channel)).toBe(false)
        }
      }),
    )
  })

  it('issues nothing for no branches', () => {
    expect(buildAdminAblyCapability([])).toEqual({})
  })

  it('skips a branch id that could change a pattern’s meaning', () => {
    for (const unsafe of ['*', 'a:b', 'a b', '', 'x'.repeat(65)]) {
      expect(isChannelSafeBranchId(unsafe)).toBe(false)
      expect(buildAdminAblyCapability([unsafe])).toEqual({})
    }
    expect(Object.keys(buildAdminAblyCapability(['*', 'branch_rs']))).toEqual(
      adminChannelPatternsForBranch('branch_rs'),
    )
  })
})
