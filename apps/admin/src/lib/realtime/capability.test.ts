/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : capability.test
 * Scope        : Property-based tests for the pure Ably capability builder
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                realtime/capability.ts` and the Receptionist+ role gate that
 *                decides whether an admin Ably token is issued at all.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests.
 ************************************************************/

import { ROLE_LEVELS, resolveRoleLevel } from '@/lib/rbac'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ADMIN_ABLY_CHANNELS, buildAdminAblyCapability } from './capability'

// Feature: admin-subdomain-migration, Property 6: Ably token capability is subscribe-only and scoped to admin channels
//
// Property 6: Ably token capability is subscribe-only and scoped to admin channels
// Validates: Requirements 8.1
//
// For any requesting user holding a role of Receptionist or higher, the issued
// Ably token capability grants only the `subscribe` operation and only on
// channels within the admin set (admin:bookings:*, admin:schedule:*,
// admin:leave, booking:*); for any user below Receptionist, no admin token is
// issued (request is forbidden).

describe('Property 6: Ably token capability is subscribe-only and scoped to admin channels', () => {
  // The canonical allowed admin channel set, as a Set for subset checks.
  const ALLOWED_CHANNELS = new Set<string>(ADMIN_ABLY_CHANNELS)

  // The role gate: a Receptionist+ (level >= 2) user gets an admin token.
  const RECEPTIONIST_LEVEL = ROLE_LEVELS.receptionist
  const isAdminRole = (role: string | null | undefined): boolean =>
    resolveRoleLevel(role) >= RECEPTIONIST_LEVEL

  // Pure model of the token-issuing decision: Receptionist+ receives the admin
  // capability map; anyone below is forbidden (no token).
  type TokenDecision = { issued: true; capability: Record<string, string[]> } | { issued: false }

  const decideToken = (role: string | null | undefined): TokenDecision =>
    isAdminRole(role) ? { issued: true, capability: buildAdminAblyCapability() } : { issued: false }

  // --- Capability shape invariants (builder takes no input) --------------- //

  it('grants only the subscribe operation on every channel', () => {
    fc.assert(
      // The builder is nullary; the property is over repeated invocations to
      // confirm the invariant holds deterministically across runs.
      fc.property(fc.constant(null), () => {
        const capability = buildAdminAblyCapability()
        const operations = new Set<string>()
        for (const ops of Object.values(capability)) {
          for (const op of ops) {
            operations.add(op)
          }
          // Each channel's operation array is exactly ['subscribe'].
          expect(ops).toEqual(['subscribe'])
        }
        // The only operation present anywhere is 'subscribe' (no publish,
        // presence, history, etc.).
        expect([...operations]).toEqual(['subscribe'])
      }),
      { numRuns: 25 },
    )
  })

  it('only includes channels from the allowed admin set and covers it exactly', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const capability = buildAdminAblyCapability()
        const keys = Object.keys(capability)

        // Non-empty.
        expect(keys.length).toBeGreaterThan(0)

        // Subset: no customer/other channel leaks in.
        for (const channel of keys) {
          expect(ALLOWED_CHANNELS.has(channel)).toBe(true)
        }

        // Exact coverage: the capability covers precisely ADMIN_ABLY_CHANNELS.
        expect(new Set(keys)).toEqual(ALLOWED_CHANNELS)
        expect(keys.length).toBe(ALLOWED_CHANNELS.size)
      }),
      { numRuns: 25 },
    )
  })

  // --- Role-gating decision (genuinely input-varying) --------------------- //

  // Arbitrary roles: the known hierarchy plus unknown/empty strings and the
  // null/undefined cases, all of which resolveRoleLevel must handle.
  const roleArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
    fc.constantFrom(...Object.keys(ROLE_LEVELS)),
    fc.string(),
    fc.constantFrom(null, undefined, 'ADMIN', 'Receptionist', 'root', ''),
  )

  it('issues the admin subscribe-only capability iff the role is Receptionist or higher', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const level = resolveRoleLevel(role)
        const decision = decideToken(role)

        if (level >= RECEPTIONIST_LEVEL) {
          // Receptionist+ : a token IS issued with the admin capability.
          expect(decision.issued).toBe(true)
          if (decision.issued) {
            // The issued capability is exactly the admin set, subscribe-only.
            expect(new Set(Object.keys(decision.capability))).toEqual(ALLOWED_CHANNELS)
            for (const ops of Object.values(decision.capability)) {
              expect(ops).toEqual(['subscribe'])
            }
          }
        } else {
          // Below Receptionist : forbidden, no token issued.
          expect(decision.issued).toBe(false)
        }
      }),
      { numRuns: 25 },
    )
  })

  it('forbids every role below Receptionist (customer, staff, unknown, absent)', () => {
    const belowReceptionistArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
      fc.constantFrom('customer', 'staff'),
      fc.string().filter((s) => resolveRoleLevel(s) < RECEPTIONIST_LEVEL),
      fc.constantFrom(null, undefined, ''),
    )

    fc.assert(
      fc.property(belowReceptionistArb, (role) => {
        expect(isAdminRole(role)).toBe(false)
        expect(decideToken(role).issued).toBe(false)
      }),
      { numRuns: 25 },
    )
  })
})
