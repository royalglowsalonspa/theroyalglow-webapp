/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : onboarding-guard.test
 * Scope        : Authentication — profile-completion routing
 *
 * Description  : Behaviour + placement tests for the server-side onboarding
 *                gate (apps/web/src/lib/onboarding-guard.ts).
 *
 *                Behaviour (mocked session + mocked profile probe):
 *                  - authenticated, NO profile, protected page → /onboarding
 *                  - authenticated, HAS profile, /onboarding   → /
 *                  - authenticated, NO profile, /onboarding    → allowed through
 *                  - unauthenticated                           → /
 *                  - the two guards never both redirect (no loop)
 *
 *                Placement (static, node:fs) — proves the gate covers the
 *                protected surfaces, leaves genuinely public pages free of a DB
 *                round-trip, and stays OUT of the edge middleware.
 *
 * Validates: Requirements 4.4, 4.5, 4.7
 *
 * Tech Stack   : Vitest + node:fs
 * Layer        : Test
 ************************************************************/

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `redirect()` from next/navigation throws internally to abort rendering. Mirror
// that with a sentinel carrying the target so tests can assert on the path.
class RedirectSignal extends Error {
  constructor(readonly target: string) {
    super(`NEXT_REDIRECT:${target}`)
  }
}

const redirectMock = vi.hoisted(() =>
  vi.fn((target: string): never => {
    throw new RedirectSignal(target)
  }),
)

vi.mock('next/navigation', () => ({ redirect: redirectMock }))

// next/headers is unavailable outside a Next.js request scope; stub it.
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))

// Better Auth session resolution — never touches the real Drizzle/Neon stack.
const getSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth-server', () => ({ auth: { api: { getSession: getSessionMock } } }))

// The profile existence probe (packages/db/src/queries/customers.ts).
const hasCustomerProfileMock = vi.hoisted(() => vi.fn())
vi.mock('@rgss/db/queries', () => ({ hasCustomerProfile: hasCustomerProfileMock }))

// Imported after the mocks are registered (vi.mock is hoisted above imports).
import { requireOnboardedSession, requireOnboardingPending } from './onboarding-guard'

const SESSION = { user: { id: 'u_test', name: 'Test User', email: 'test@example.com' } }

/** Run a guard and report whether it redirected, and to where. */
async function runGuard(
  guard: () => Promise<unknown>,
): Promise<{ redirected: true; target: string } | { redirected: false; session: unknown }> {
  try {
    const session = await guard()
    return { redirected: false, session }
  } catch (error) {
    if (error instanceof RedirectSignal) {
      return { redirected: true, target: error.target }
    }
    throw error
  }
}

beforeEach(() => {
  redirectMock.mockClear()
  getSessionMock.mockReset()
  hasCustomerProfileMock.mockReset()
})

describe('requireOnboardedSession — protected customer surfaces (Req 4.4)', () => {
  it('redirects an authenticated user with NO customer_profile to /onboarding', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    hasCustomerProfileMock.mockResolvedValue(false)

    const result = await runGuard(requireOnboardedSession)

    expect(result).toEqual({ redirected: true, target: '/onboarding' })
    expect(hasCustomerProfileMock).toHaveBeenCalledWith('u_test')
  })

  it('lets an authenticated user WITH a customer_profile through and returns the session', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    hasCustomerProfileMock.mockResolvedValue(true)

    const result = await runGuard(requireOnboardedSession)

    expect(result).toEqual({ redirected: false, session: SESSION })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('redirects an unauthenticated visitor to / and never probes the profile', async () => {
    getSessionMock.mockResolvedValue(null)

    const result = await runGuard(requireOnboardedSession)

    expect(result).toEqual({ redirected: true, target: '/' })
    expect(hasCustomerProfileMock).not.toHaveBeenCalled()
  })
})

describe('requireOnboardingPending — the /onboarding page itself (Req 4.5)', () => {
  it('redirects a user who ALREADY has a customer_profile to /', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    hasCustomerProfileMock.mockResolvedValue(true)

    const result = await runGuard(requireOnboardingPending)

    expect(result).toEqual({ redirected: true, target: '/' })
  })

  it('lets an authenticated user with NO customer_profile through', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    hasCustomerProfileMock.mockResolvedValue(false)

    const result = await runGuard(requireOnboardingPending)

    expect(result).toEqual({ redirected: false, session: SESSION })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('redirects an unauthenticated visitor to /', async () => {
    getSessionMock.mockResolvedValue(null)

    const result = await runGuard(requireOnboardingPending)

    expect(result).toEqual({ redirected: true, target: '/' })
  })
})

describe('no redirect loop: exactly one side redirects for any profile state', () => {
  for (const onboarded of [true, false]) {
    it(`hasCustomerProfile=${onboarded} → the protected gate and the /onboarding gate disagree`, async () => {
      getSessionMock.mockResolvedValue(SESSION)
      hasCustomerProfileMock.mockResolvedValue(onboarded)

      const protectedResult = await runGuard(requireOnboardedSession)
      const onboardingResult = await runGuard(requireOnboardingPending)

      // Whichever way the fact points, precisely one of the two surfaces
      // redirects — so a user can always settle somewhere.
      const redirects = [protectedResult.redirected, onboardingResult.redirected].filter(Boolean)
      expect(redirects).toHaveLength(1)
    })
  }
})

/************************************************************
 * PLACEMENT INVARIANTS (static — node:fs)
 *
 * The gate must cover the protected surfaces, leave genuinely public pages
 * without a DB round-trip, and stay out of the edge middleware (Better Auth's
 * auth-server cannot be imported there — kysely is edge-incompatible).
 ************************************************************/

const here = dirname(fileURLToPath(import.meta.url))
const WEB_SRC = resolve(here, '..')
const APP = join(WEB_SRC, 'app')

const PROTECTED_SEGMENTS = ['profile', 'bookings', 'membership', 'gems']

/** Import specifiers only — comments that merely DISCUSS a module do not count. */
function importSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)).map(
    (match) => match[1] ?? '',
  )
}

describe('placement: every protected customer segment mounts the gate (Req 4.4)', () => {
  for (const segment of PROTECTED_SEGMENTS) {
    it(`/${segment} has a server layout calling requireOnboardedSession`, () => {
      const layout = join(APP, '(customer)', segment, 'layout.tsx')
      expect(existsSync(layout)).toBe(true)

      const source = readFileSync(layout, 'utf8')
      expect(source).toContain('requireOnboardedSession')
      expect(importSpecifiers(source)).toContain('@/lib/onboarding-guard')
    })
  }

  it('the /onboarding page mounts the inverse gate', () => {
    const source = readFileSync(join(APP, '(auth)', 'onboarding', 'page.tsx'), 'utf8')
    expect(source).toContain('requireOnboardingPending')
    expect(importSpecifiers(source)).toContain('@/lib/onboarding-guard')
  })
})

describe('placement: public pages stay free of the profile lookup (Req 4.7)', () => {
  it('the shared (customer) layout does NOT mount the gate', () => {
    // (customer)/layout.tsx wraps the homepage, /services, /blog, /about,
    // /contact and /faq as well as the protected pages — gating there would put
    // a DB round-trip on every public page view.
    const source = readFileSync(join(APP, '(customer)', 'layout.tsx'), 'utf8')
    expect(source).not.toContain('onboarding-guard')
    expect(source).not.toContain('hasCustomerProfile')
  })

  it('no public route group layout mounts the gate', () => {
    for (const group of ['(landing)', '(legal)']) {
      const source = readFileSync(join(APP, group, 'layout.tsx'), 'utf8')
      expect(source).not.toContain('onboarding-guard')
    }
  })

  it('the root layout does NOT mount the gate', () => {
    const source = readFileSync(join(APP, 'layout.tsx'), 'utf8')
    expect(source).not.toContain('onboarding-guard')
  })
})

describe('placement: the gate is NOT in the edge middleware', () => {
  it('middleware.ts imports no auth-server, db or onboarding-guard module', () => {
    const source = readFileSync(join(WEB_SRC, 'middleware.ts'), 'utf8')
    const forbidden = importSpecifiers(source).filter((specifier) =>
      /auth-server|@rgss\/db|onboarding-guard/.test(specifier),
    )
    expect(forbidden).toEqual([])
  })

  it('middleware.ts runs no customer_profile lookup', () => {
    const source = readFileSync(join(WEB_SRC, 'middleware.ts'), 'utf8')
    expect(source).not.toContain('hasCustomerProfile')
    expect(source).not.toContain('customerProfile')
  })

  it('middleware.ts still gates the same protected prefixes and sends anonymous users to /', () => {
    const source = readFileSync(join(WEB_SRC, 'middleware.ts'), 'utf8')
    for (const segment of PROTECTED_SEGMENTS) {
      expect(source).toContain(`'/${segment}'`)
    }
    expect(source).toContain("'/onboarding'")
    // Unauthenticated → homepage. No /sign-in route exists to redirect to.
    expect(source).toContain("new URL('/', request.url)")
    expect(source).not.toContain("'/sign-in'")
  })
})
