// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone Playwright rehearsal.
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test'
import type { BranchRoleChangeInput } from '@rgss/types'
import { type ConnectionStateChange, ErrorInfo, Realtime, Rest } from 'ably'
import { z } from 'zod'
import { rehearsalDomain } from '../../../scripts/release/rehearsal-config'
import { buildAdminAblyCapability, isChannelSafeBranchId } from '../src/lib/realtime/capability'
import { adminBookingsChannel } from '../src/lib/realtime/channels'
import { type BranchRoles, data, type MyBranches } from './fixtures/admin-api'
import { hasRoleState, IMPERSONATED_ROLE, roleStatePath } from './fixtures/auth'

const TOKEN_REVOKED = 40141
const REVOCATION_TIMEOUT_MS = 15_000
const ADMIN_REQUEST = { maxRedirects: 0, timeout: 10_000 }
const PRODUCTION_ADMIN = 'https://admin.theroyalglow.in'
const PRODUCTION_WEB = 'https://theroyalglow.in'
const PRODUCTION_FIXTURE_BRANCH = 'RGSS Launch Verification'
const SESSION_URL = '/api/auth/get-session?disableCookieCache=true'
const ablyAppId = z.string().regex(/^[A-Za-z0-9_-]+$/)
const fixtureId = z.string().regex(/^[A-Za-z0-9_-]+$/)
const signedTokenRequest = z.object({
  keyName: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  clientId: z.string().min(1),
  capability: z.string(),
  mac: z.string().min(1),
  nonce: z.string().min(16),
  timestamp: z.number().int().positive(),
  ttl: z.number().int().positive(),
})

function readFixture() {
  const production = process.env.ADMIN_E2E_REALTIME_HANDOVER === 'production-fixture'
  const domain = production ? null : rehearsalDomain(process.env.REHEARSAL_DOMAIN ?? '')
  const origin = production ? PRODUCTION_ADMIN : `https://admin.${domain}`
  const webOrigin = production ? PRODUCTION_WEB : `https://web.${domain}`
  if (process.env.PLAYWRIGHT_ADMIN_BASE_URL?.replace(/\/$/, '') !== origin) {
    throw new Error('PLAYWRIGHT_ADMIN_BASE_URL must match the selected admin origin')
  }
  const productionApp = ablyAppId.safeParse(process.env.PRODUCTION_ABLY_APP_ID)
  const app = production ? productionApp : ablyAppId.safeParse(process.env.REHEARSAL_ABLY_APP_ID)
  if (!app.success || !productionApp.success || (!production && app.data === productionApp.data)) {
    throw new Error(
      'Set the expected Ably app ID and keep the isolated app distinct from production',
    )
  }
  const branchId = process.env.ADMIN_E2E_REVOCATION_BRANCH_ID ?? ''
  const managerEmail = process.env.ADMIN_E2E_REVOCATION_MANAGER_EMAIL?.trim().toLowerCase() ?? ''
  if (!isChannelSafeBranchId(branchId) || !z.email().safeParse(managerEmail).success) {
    throw new Error('Set the disposable branch ID and Manager email for the realtime rehearsal')
  }
  if (IMPERSONATED_ROLE || !hasRoleState('owner') || !hasRoleState('manager')) {
    throw new Error('Use signed Owner and Manager storage states for the handover check')
  }
  const approved = production
    ? z.object({ ownerId: fixtureId, managerId: fixtureId, leadId: fixtureId }).parse({
        ownerId: process.env.ADMIN_E2E_REVOCATION_OWNER_ID,
        managerId: process.env.ADMIN_E2E_REVOCATION_MANAGER_ID,
        leadId: process.env.ADMIN_E2E_REVOCATION_LEAD_ID,
      })
    : null
  return { origin, webOrigin, appId: app.data, branchId, managerEmail, approved }
}

async function roleChange(owner: APIRequestContext, input: BranchRoleChangeInput) {
  return data<{ changed: boolean; liveUpdates: string; reassignments: number }>(
    await owner.post('/api/users', { ...ADMIN_REQUEST, data: input }),
  )
}

function expectDenied(response: APIResponse, webOrigin: string, path: string) {
  const status = response.status()
  if (status === 307) {
    expect(new URL(response.headers().location ?? '').origin).toBe(webOrigin)
    return
  }
  expect([401, 403], `the old Manager session must be denied at ${path}`).toContain(status)
}

async function readFixtureLead(context: APIRequestContext, leadPath: string, branchId: string) {
  const { lead } = await data<{ lead: { branchId: string; status: string } }>(
    await context.get(leadPath, ADMIN_REQUEST),
  )
  expect(lead).toMatchObject({ branchId, status: 'new' })
}

async function connectManager(
  manager: APIRequestContext,
  fixture: ReturnType<typeof readFixture>,
  userId: string,
) {
  const { active, branches } = await data<MyBranches>(
    await manager.get('/api/me/branch', ADMIN_REQUEST),
  )
  expect(active).toMatchObject({ id: fixture.branchId, role: 'manager' })
  expect(branches.map(({ id }) => id)).toEqual([fixture.branchId])

  const response = await manager.post('/api/ably/token', ADMIN_REQUEST)
  expect(response.status(), 'the signed Manager must be able to request a token').toBe(200)
  const signed = signedTokenRequest.safeParse(await data<unknown>(response))
  if (!signed.success) throw new Error('Admin did not issue a signed Ably TokenRequest')
  expect(signed.data.clientId === userId, 'the token must belong to the fixture Manager').toBe(true)
  expect(signed.data.keyName.split('.')[0], 'the issuer must match the selected Ably app').toBe(
    fixture.appId,
  )
  const capability = buildAdminAblyCapability([fixture.branchId])
  expect(JSON.parse(signed.data.capability)).toEqual(capability)

  // Exchange the app-issued request once. The live client cannot refresh it.
  const rest = new Rest({
    authCallback: (_params, callback) => callback(null, signed.data),
    logLevel: 0,
    httpRequestTimeout: 5_000,
    httpMaxRetryCount: 0,
  })
  const token = await rest.auth.requestToken()
  expect(token.clientId === userId, 'the issued token must belong to the fixture Manager').toBe(
    true,
  )
  expect(JSON.parse(token.capability ?? '{}')).toEqual(capability)
  return new Realtime({ token, logLevel: 0, realtimeRequestTimeout: 5_000 })
}

async function revokeWhileConnected(client: Realtime, removeRole: () => Promise<void>) {
  const revoked = Promise.withResolvers<number | null>()
  const disconnected = (change: ConnectionStateChange) => {
    if (change.reason?.code === TOKEN_REVOKED) revoked.resolve(change.reason.code)
  }
  client.connection.on('disconnected', disconnected)
  const timer = setTimeout(() => revoked.resolve(null), REVOCATION_TIMEOUT_MS)
  try {
    await removeRole()
    expect(await revoked.promise, 'the existing Ably connection must observe revocation').toBe(
      TOKEN_REVOKED,
    )
  } finally {
    clearTimeout(timer)
    client.connection.off('disconnected', disconnected)
  }
}

test.use({ trace: 'off' })

test.describe('Deployed realtime role handover', () => {
  // The write invalidates the stored Manager session even when the role is restored.
  test.describe.configure({ retries: 0, timeout: 80_000 })
  test.skip(
    !['1', 'production-fixture'].includes(process.env.ADMIN_E2E_REALTIME_HANDOVER ?? ''),
    'requires approved signed fixture sessions',
  )

  test('removing a Manager revokes a connected subscriber and denies a fresh token', async ({
    playwright,
  }) => {
    const fixture = readFixture()
    const owner = await playwright.request.newContext({
      baseURL: fixture.origin,
      storageState: roleStatePath('owner'),
    })
    let manager: APIRequestContext | undefined
    let client: Realtime | undefined
    try {
      const { active } = await data<MyBranches>(await owner.get('/api/me/branch', ADMIN_REQUEST))
      expect(active).toMatchObject({ id: fixture.branchId, role: 'owner' })
      const readRoles = async () =>
        data<BranchRoles>(await owner.get('/api/users/branch-roles', ADMIN_REQUEST))
      const { branch, owner: branchOwner, manager: holder, can } = await readRoles()
      expect(branch.id).toBe(fixture.branchId)
      expect(can.setManager).toBe(true)
      if (!holder || holder.email.toLowerCase() !== fixture.managerEmail) {
        throw new Error('The active branch must be managed by the named disposable fixture account')
      }
      const approved = fixture.approved
      const leadPath = approved ? `/api/leads/${approved.leadId}` : null
      if (approved) {
        expect(active).toMatchObject({ isPrimary: false })
        expect(branch).toMatchObject({
          name: PRODUCTION_FIXTURE_BRANCH,
          status: 'temporarily_closed',
        })
        expect(branchOwner?.id === approved.ownerId).toBe(true)
        expect(holder.id === approved.managerId).toBe(true)
      }

      manager = await playwright.request.newContext({
        baseURL: fixture.origin,
        storageState: roleStatePath('manager'),
      })
      if (leadPath) {
        await readFixtureLead(owner, leadPath, branch.id)
        await readFixtureLead(manager, leadPath, branch.id)
        expect((await manager.get('/leads', ADMIN_REQUEST)).status()).toBe(200)
      }
      client = await connectManager(manager, fixture, holder.id)
      const channel = client.channels.get(adminBookingsChannel(branch.id))
      await channel.attach()
      expect(channel.state).toBe('attached')
      expect(client.connection.state).toBe('connected')

      try {
        await revokeWhileConnected(client, async () => {
          const result = await roleChange(owner, {
            kind: 'remove',
            branchId: branch.id,
            userId: holder.id,
          })
          expect(result).toMatchObject({ changed: true, liveUpdates: 'stopped', reassignments: 0 })
        })
        expect((await readRoles()).manager).toBeNull()

        const checks = leadPath
          ? ([
              ['GET', '/leads', undefined],
              ['GET', leadPath, undefined],
              ['PATCH', leadPath, { branchId: branch.id, status: 'contacted' }],
              ['POST', '/api/ably/token', undefined],
            ] as const)
          : ([['POST', '/api/ably/token', undefined]] as const)
        for (const [method, path, body] of checks) {
          // Use the original cookie each time, including after a denial clears it.
          const stale = await playwright.request.newContext({
            baseURL: fixture.origin,
            storageState: roleStatePath('manager'),
          })
          try {
            const response = await stale.fetch(path, { method, data: body, ...ADMIN_REQUEST })
            expectDenied(response, fixture.webOrigin, path)
          } finally {
            await stale.dispose()
          }
        }
        if (leadPath) await readFixtureLead(owner, leadPath, branch.id)
      } finally {
        const { manager: current } = await readRoles()
        if (current === null) {
          const restored = await roleChange(owner, {
            kind: 'set_manager',
            branchId: branch.id,
            userId: holder.id,
            expectedHolderId: null,
          })
          expect(restored.changed, 'restore the original fixture role').toBe(true)
          expect((await readRoles()).manager?.id).toBe(holder.id)
        } else {
          expect(current.id, 'the branch should retain its original fixture Manager').toBe(
            holder.id,
          )
        }
      }
      const sessionAfter = await manager.get(SESSION_URL, ADMIN_REQUEST)
      expect(sessionAfter.status()).toBe(200)
      expect(await sessionAfter.json()).toBeNull()
    } catch (error) {
      if (error instanceof ErrorInfo) {
        throw new Error(`Ably rehearsal failed with provider code ${error.code}`)
      }
      throw error
    } finally {
      client?.close()
      await Promise.all([owner.dispose(), manager?.dispose()])
    }
  })
})
