/************************************************************
 * Property-based test for RBAC level comparison in requireRole.
 *
 * Feature : backend-api
 * Property: 23 — Admin access requires at least Receptionist
 * Validates: Requirements 10.1
 *
 * Description : fast-check + Vitest property test for the RBAC comparison in
 *               `requireRole` (apps/web/src/lib/api/session.ts) across the
 *               hierarchy customer < staff < receptionist < manager < owner <
 *               developer. For any generated role and minRole, requireRole
 *               resolves the session when level(role) >= level(minRole) and
 *               otherwise throws an AppError FORBIDDEN (403). The Better Auth
 *               session resolution (auth.api.getSession) is mocked to return a
 *               user carrying the generated role.
 *
 * Tech Stack  : Vitest + fast-check
 * Layer       : Test
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import * as fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mutable holder for the role the mocked session resolution returns. Each
// fast-check iteration sets this before invoking requireRole.
const sessionState = vi.hoisted(() => ({ role: 'customer' as string | undefined }))

// Mock Better Auth session resolution: getSession returns a user with the
// generated role. Never hits the real better-auth/Drizzle/Neon stack.
const getSessionMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: getSessionMock } },
}))

// next/headers is unavailable outside the Next.js request scope; stub it.
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

// Imported after the mocks are registered (vi.mock is hoisted above imports).
import { requireRole } from './session'

// Hierarchy levels mirrored from session.ts (the system under test).
const ROLE_LEVELS: Record<string, number> = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

const ROLES = Object.keys(ROLE_LEVELS)

beforeEach(() => {
  getSessionMock.mockReset()
  getSessionMock.mockImplementation(async () => ({
    user: { id: 'u_test', role: sessionState.role },
  }))
})

// Feature: backend-api, Property 23: Admin access requires at least Receptionist
describe('requireRole — RBAC level comparison', () => {
  it('resolves the session when level(role) >= level(minRole), else throws FORBIDDEN 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ROLES),
        fc.constantFrom(...ROLES),
        async (role, minRole) => {
          sessionState.role = role

          // `role`/`minRole` are drawn from ROLES (the keys of ROLE_LEVELS), so
          // both lookups are always defined; default to 0 to satisfy
          // noUncheckedIndexedAccess without changing the comparison.
          const permitted = (ROLE_LEVELS[role] ?? 0) >= (ROLE_LEVELS[minRole] ?? 0)

          if (permitted) {
            const session = await requireRole(minRole as keyof typeof ROLE_LEVELS)
            expect((session.user as { role?: string }).role).toBe(role)
          } else {
            // The request must be rejected with a FORBIDDEN 403 AppError.
            const error = await requireRole(minRole as keyof typeof ROLE_LEVELS).then(
              () => {
                throw new Error('expected requireRole to reject')
              },
              (e: unknown) => e,
            )
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe(ERROR_CODES.FORBIDDEN)
            expect((error as AppError).statusCode).toBe(403)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
