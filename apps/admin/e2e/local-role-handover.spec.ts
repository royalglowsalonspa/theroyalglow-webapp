// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Opt-in local Playwright rehearsal.
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test'
import type { BranchRoleChangeInput } from '@rgss/types'
import { type BranchRoles, data, errorCode, type MyBranches } from './fixtures/admin-api'
import { roleStatePath } from './fixtures/auth'
import { localSignedOrigin } from './fixtures/local-signed-origin'

const REQUEST = { maxRedirects: 0, timeout: 10_000 }
const FIXTURE_BRANCH = 'rehearsal_mb_a'
const FIXTURE_MANAGER = 'rehearsal_mb_a_manager'
const FIXTURE_LEAD = '/api/leads/rehearsal_mb_a_lead'
const SESSION_URL = '/api/auth/get-session?disableCookieCache=true'

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
    const baseURL = localSignedOrigin()
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
      expect((await sessionBefore.json())?.user?.id).toBe(FIXTURE_MANAGER)
      const cachedSession = sessionBefore
        .headersArray()
        .find(
          ({ name, value }) =>
            name.toLowerCase() === 'set-cookie' &&
            /^(?:__Secure-)?better-auth\.session_data=/.test(value),
        )
        ?.value.split(';')[0]
      const originalToken = (await manager.storageState()).cookies.find(({ name }) =>
        /^(?:__Secure-)?better-auth\.session_token$/.test(name),
      )
      if (!cachedSession || !originalToken) {
        throw new Error('Expected a signed session token and a genuine Better Auth session cache')
      }
      const cachedRequest = {
        ...REQUEST,
        headers: { cookie: `${originalToken.name}=${originalToken.value}; ${cachedSession}` },
      }

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

        const cachedPageRequest = await playwright.request.newContext({ baseURL })
        try {
          const cachedPage = await cachedPageRequest.get('/leads', cachedRequest)
          expectAccessDenied(cachedPage, '/leads with the signed session cache')
        } finally {
          await cachedPageRequest.dispose()
        }

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
      expect((await sessionAfter.json()) === null).toBe(true)
      const cachedAfterRestore = await playwright.request.newContext({ baseURL })
      try {
        expectAccessDenied(
          await cachedAfterRestore.get(FIXTURE_LEAD, cachedRequest),
          `${FIXTURE_LEAD} with a signed cache after role restoration`,
        )
      } finally {
        await cachedAfterRestore.dispose()
      }
    } finally {
      await Promise.all([owner.dispose(), manager.dispose()])
    }
  })
})
