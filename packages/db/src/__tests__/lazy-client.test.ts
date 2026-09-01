/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 01-09-2026 & Updated - 01-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : lazy-client
 * Scope        : Data Access — lazy client initialization contract
 *
 * Description  : Guards the lazy `db` Proxy against build-time initialization.
 *
 *                `next build` imports every route module to collect page data,
 *                with no `DATABASE_URL` in the build environment. Anything that
 *                forces `neon()` during module evaluation therefore fails the
 *                build rather than the request.
 *
 *                Better Auth 1.7's `drizzleAdapter` reads `db._?.schema` when the
 *                adapter is CONSTRUCTED (`buildRelationKeysByModel`), and
 *                `auth-server.ts` constructs it at module scope — so the 1.7
 *                upgrade broke both app builds with "No database connection
 *                string was provided to `neon()`". 1.6.26 never touched `db` at
 *                construction time.
 *
 * Responsibilities :
 * - Assert introspection of `db._` never initializes the client
 * - Assert the exemption stays NARROW (real query properties still initialize)
 *
 * Tech Stack   : TypeScript (strict), Vitest
 * Layer        : Data Access (test)
 *
 * Dependencies : vitest, ../index
 *
 * Notes        : Modules are reset per test because the client is memoized in
 *                module scope once created.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Read a property off `db` without tripping the typed surface. */
function read(target: unknown, prop: string): unknown {
  return (target as Record<string, unknown>)[prop]
}

describe('lazy db client initialization', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('answers Better Auth\u2019s `db._` introspection without a connection string', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const { db } = await import('../index')

    // This is the exact access Better Auth 1.7's drizzleAdapter performs at
    // construction time. It must not throw, or `next build` fails.
    expect(() => read(db, '_')).not.toThrow()
    expect(read(db, '_')).toBeUndefined()
  })

  it('reports `_` as absent via `in` when uninitialized', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const { db } = await import('../index')

    expect(() => '_' in (db as object)).not.toThrow()
    expect('_' in (db as object)).toBe(false)
  })

  it('keeps the exemption narrow \u2014 a real query property still initializes', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const { db } = await import('../index')

    // Only `_` is exempt. Anything that implies actual database work must still
    // demand a connection string, so a genuinely misconfigured runtime fails
    // loudly instead of silently returning undefined.
    expect(() => read(db, 'select')).toThrow(/database connection string/i)
  })

  it('initializes normally once a connection string is present', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@example.neon.tech/neondb?sslmode=require')
    const { db } = await import('../index')

    expect(() => read(db, 'select')).not.toThrow()
    expect(read(db, 'select')).toBeTypeOf('function')
  })
})
