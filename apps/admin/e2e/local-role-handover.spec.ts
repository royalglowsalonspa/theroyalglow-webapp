// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Opt-in local Playwright rehearsal.
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test'
import type { BranchRoleChangeInput } from '@rgss/types'
import { type BranchRoles, data, errorCode, type MyBranches } from './fixtures/admin-api'
import { hasRoleState, IMPERSONATED_ROLE, roleStatePath } from './fixtures/auth'

const REQUEST = { maxRedirects: 0, timeout: 10_000 }
const FIXTURE_BRANCH = 'rehearsal_mb_a'
const FIXTURE_MANAGER = 'rehearsal_mb_a_manager'
const FIXTURE_LEAD = '/api/leads/rehearsal_mb_a_lead'
const SESSION_URL = '/api/auth/get-session?disableCookieCache=true'

function fixtureOrigin() {
  const origin = URL.parse(process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? '')
  const database = URL.parse(process.env.DATABASE_URL ?? '')
  if (
    origin?.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    !origin.port ||
    origin.href !== `${origin.origin}/` ||
    database?.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(database.hostname) ||
    !/^\/rgss_rehearsal_[a-z0-9_]+$/.test(database.pathname) ||
    !process.env.REHEARSAL_PG_DATA ||
    IMPERSONATED_ROLE ||
    !hasRoleState('owner') ||
    !hasRoleState('manager')
  ) {
    throw new Error(
      'Use the loopback rehearsal app, synthetic database and signed fixture sessions',
    )
  }
  return origin.origin
}

function applyRoleChange(owner: APIRequestContext, change: BranchRoleChangeInput) {
  return owner
    .post('/api/users', { ...REQUEST, data: change })
    .then((response) =>
      data<{ changed: boolean; liveUpdates: string; reassignments: number }>(response),
    )
}

function expectAccessDenied(response: APIResponse, path: string) {
  expect([307, 401, 403], `The old Manager session must be denied at ${path}`).toContain(
    response.status(),
  )
}

test.use({ trace: 'off' })
test.describe('Local signed Manager handover', () => {
  test.describe.configure({ retries: 0, timeout: 75_000 })
  test.skip(process.env.ADMIN_E2E_LOCAL_HANDOVER !== '1', 'requires local rehearsal fixtures')

  test('removal cuts off a Manager’s signed session across pages, reads, writes and token requests', async ({
    playwright,
  }) => {
    const baseURL = fixtureOrigin()
    const owner = await playwright.request.newContext({
      baseURL,
      storageState: roleStatePath('owner'),
    })
    const manager = await playwright.request.newContext({
      baseURL,
      storageState: roleStatePath('manager'),
    })
    const readRoles = async () =>
      data<BranchRoles>(await owner.get('/api/users/branch-roles', REQUEST))
    try {
      const roles = await readRoles()
      expect(roles.branch.id).toBe(FIXTURE_BRANCH)
      expect(roles.manager).toMatchObject({
        id: FIXTURE_MANAGER,
        email: 'a.manager@example.invalid',
      })
      const { active, branches } = await data<MyBranches>(
        await manager.get('/api/me/branch', REQUEST),
      )
      expect(active).toMatchObject({ id: FIXTURE_BRANCH, role: 'manager' })
      expect(branches.map((branch) => branch.id)).toEqual([FIXTURE_BRANCH])
      expect((await manager.get('/leads', REQUEST)).status()).toBe(200)
      expect((await manager.get(FIXTURE_LEAD, REQUEST)).status()).toBe(200)
      const tokenBefore = await manager.post('/api/ably/token', REQUEST)
      expect(tokenBefore.status()).toBe(503)
      expect(await errorCode(tokenBefore)).toBe('SERVICE_UNAVAILABLE')
      const sessionBefore = await manager.get(SESSION_URL, REQUEST)
      expect(sessionBefore.status()).toBe(200)
      expect(await sessionBefore.json()).toMatchObject({ user: { id: FIXTURE_MANAGER } })

      try {
        const removed = await applyRoleChange(owner, {
          kind: 'remove',
          branchId: FIXTURE_BRANCH,
          userId: FIXTURE_MANAGER,
        })
        expect(removed).toMatchObject({
          changed: true,
          liveUpdates: 'not_configured',
          reassignments: 0,
        })
        expect((await readRoles()).manager).toBeNull()

        // Separate contexts keep the same original cookie for every assertion,
        // even if middleware clears it on the previous denied request.
        const staleSession = roleStatePath('manager')
        for (const [method, path, body] of [
          ['GET', '/leads', undefined],
          ['GET', FIXTURE_LEAD, undefined],
          ['PATCH', FIXTURE_LEAD, { branchId: FIXTURE_BRANCH, status: 'contacted' }],
          ['POST', '/api/ably/token', undefined],
        ] as const) {
          const stale = await playwright.request.newContext({ baseURL, storageState: staleSession })
          try {
            expectAccessDenied(await stale.fetch(path, { ...REQUEST, method, data: body }), path)
          } finally {
            await stale.dispose()
          }
        }
        const retained = await data<{ lead: { status: string } }>(
          await owner.get(FIXTURE_LEAD, REQUEST),
        )
        expect(retained.lead.status).toBe('new')
      } finally {
        if ((await readRoles()).manager === null) {
          expect(
            await applyRoleChange(owner, {
              kind: 'set_manager',
              branchId: FIXTURE_BRANCH,
              userId: FIXTURE_MANAGER,
              expectedHolderId: null,
            }),
          ).toMatchObject({ changed: true })
        }
        expect((await readRoles()).manager?.id).toBe(FIXTURE_MANAGER)
      }
      // Restoration changes the branch assignment and leaves the original
      // login invalid. The Manager must establish a new session to return.
      const sessionAfter = await manager.get(SESSION_URL, REQUEST)
      expect(sessionAfter.status()).toBe(200)
      expect(await sessionAfter.json()).toBeNull()
    } finally {
      await Promise.all([owner.dispose(), manager.dispose()])
    }
  })
})
