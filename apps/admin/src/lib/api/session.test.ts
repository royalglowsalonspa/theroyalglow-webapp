// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : session.test
 * Scope        : Unit tests for RBAC session helpers
 *
 * Description  : Vitest unit tests for requireSession / getOptionalSession /
 *                requireRole in apps/admin/src/lib/api/session.ts — the admin
 *                API authorization gate. Verifies:
 *                  1. requireSession throws 401 UNAUTHENTICATED when no session.
 *                  2. requireSession returns the session and enforces the
 *                     per-user rate limit when authenticated.
 *                  3. Local dev impersonation short-circuits Better Auth.
 *                  4. requireRole enforces the 6-level role hierarchy
 *                     (customer < staff < receptionist < manager < owner <
 *                     developer): equal/higher passes, lower throws 403
 *                     FORBIDDEN, unknown/absent role defaults to customer.
 *                  5. requireRole propagates the 401 from requireSession.
 *
 * Approach     : The I/O seams are mocked so no real auth lookup, rate-limit
 *                backend, or request headers are hit — @/lib/auth-server,
 *                @/lib/dev-auth, @/lib/api/rate-limit, and next/headers.
 *                @rgss/errors stays REAL so AppError code/statusCode are
 *                asserted against the genuine registry.
 *
 * Layer        : Testing
 *
 * Notes        : Runs in the `node` environment (server-side helpers).
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock seams. Every dependency that performs I/O is mocked; the role-hierarchy
// logic under test runs for real.
// ---------------------------------------------------------------------------
const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}))
const devAuthMock = vi.hoisted(() => vi.fn())
const rateLimitMock = vi.hoisted(() => vi.fn())
const headersMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: authMocks.getSession } },
}))
vi.mock('@/lib/dev-auth', () => ({
  getDevImpersonatedSession: devAuthMock,
}))
vi.mock('@/lib/api/rate-limit', () => ({
  enforceRateLimit: rateLimitMock,
}))
vi.mock('next/headers', () => ({
  headers: headersMock,
}))

// Imported after the mocks are registered (vi.mock is hoisted above imports).
import { getOptionalSession, requireRole, requireSession } from './session'

// A minimal session shaped like Better Auth's getSession result.
function sessionWithRole(role?: string) {
  return { user: { id: 'user_123', ...(role ? { role } : {}) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: not impersonating, headers resolve, rate limit is a no-op.
  devAuthMock.mockResolvedValue(null)
  headersMock.mockResolvedValue(new Headers())
  rateLimitMock.mockResolvedValue(undefined)
})

describe('requireSession', () => {
  it('throws 401 UNAUTHENTICATED when there is no session', async () => {
    authMocks.getSession.mockResolvedValue(null)

    await expect(requireSession()).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
      statusCode: 401,
    })
    await expect(requireSession()).rejects.toBeInstanceOf(AppError)
  })

  it('returns the session and enforces the per-user rate limit when authenticated', async () => {
    const session = sessionWithRole('manager')
    authMocks.getSession.mockResolvedValue(session)

    const result = await requireSession()

    expect(result).toBe(session)
    expect(rateLimitMock).toHaveBeenCalledWith('user_123')
  })

  it('short-circuits to the dev-impersonated session without calling Better Auth', async () => {
    const dev = sessionWithRole('owner')
    devAuthMock.mockResolvedValue(dev)

    const result = await requireSession()

    expect(result).toBe(dev)
    expect(authMocks.getSession).not.toHaveBeenCalled()
    expect(rateLimitMock).not.toHaveBeenCalled()
  })

  it('propagates a 429 thrown by the rate limiter', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole('staff'))
    rateLimitMock.mockRejectedValue(
      new AppError({ code: ERROR_CODES.RATE_LIMITED, message: 'slow down', statusCode: 429 }),
    )

    await expect(requireSession()).rejects.toMatchObject({ statusCode: 429 })
  })
})

describe('getOptionalSession', () => {
  it('returns null when unauthenticated (no throw)', async () => {
    authMocks.getSession.mockResolvedValue(null)
    await expect(getOptionalSession()).resolves.toBeNull()
  })

  it('returns the dev-impersonated session when present', async () => {
    const dev = sessionWithRole('developer')
    devAuthMock.mockResolvedValue(dev)
    await expect(getOptionalSession()).resolves.toBe(dev)
  })

  it('does not enforce the rate limit (read-only optional check)', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole('customer'))
    await getOptionalSession()
    expect(rateLimitMock).not.toHaveBeenCalled()
  })
})

describe('requireRole — hierarchy enforcement', () => {
  // customer(0) < staff(1) < receptionist(2) < manager(3) < owner(4) < developer(5)
  const ORDER = ['customer', 'staff', 'receptionist', 'manager', 'owner', 'developer'] as const

  it('passes when the user role exactly equals the minimum role', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole('receptionist'))
    await expect(requireRole('receptionist')).resolves.toMatchObject({
      user: { role: 'receptionist' },
    })
  })

  it('passes when the user role is higher than the minimum role', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole('owner'))
    await expect(requireRole('manager')).resolves.toBeTruthy()
  })

  it('throws 403 FORBIDDEN when the user role is below the minimum role', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole('staff'))
    await expect(requireRole('manager')).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    })
  })

  it('treats an absent role as customer (level 0) and forbids privileged access', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole(undefined))
    await expect(requireRole('receptionist')).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    })
  })

  it('treats an unknown role as level 0 and forbids privileged access', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole('intern'))
    await expect(requireRole('staff')).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    })
  })

  it('allows developer (top of hierarchy) through every gate', async () => {
    authMocks.getSession.mockResolvedValue(sessionWithRole('developer'))
    for (const min of ORDER) {
      await expect(requireRole(min)).resolves.toBeTruthy()
    }
  })

  it('enforces every adjacent boundary: role N fails gate N+1, passes gate N', async () => {
    for (let i = 0; i < ORDER.length; i++) {
      const role = ORDER[i]
      if (!role) continue
      // Passes its own level.
      authMocks.getSession.mockResolvedValue(sessionWithRole(role))
      await expect(requireRole(role)).resolves.toBeTruthy()
      // Fails the next level up (if one exists).
      const next = ORDER[i + 1]
      if (next) {
        authMocks.getSession.mockResolvedValue(sessionWithRole(role))
        await expect(requireRole(next)).rejects.toMatchObject({ statusCode: 403 })
      }
    }
  })

  it('propagates the 401 from requireSession when unauthenticated', async () => {
    authMocks.getSession.mockResolvedValue(null)
    await expect(requireRole('staff')).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
      statusCode: 401,
    })
  })
})
