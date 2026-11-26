// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Opt-in local Playwright rehearsal.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { data, type MyBranches } from './fixtures/admin-api'
import { localSignedOrigin } from './fixtures/local-signed-origin'

const REQUEST = { maxRedirects: 0, timeout: 10_000 }
const BRANCH_ID = 'rehearsal_mb_a'

test.use({ trace: 'off' })
test.describe('Local signed Staff portal', () => {
  test.describe.configure({ retries: 0, timeout: 75_000 })
  test.skip(process.env.ADMIN_E2E_LOCAL_HANDOVER !== '1', 'requires local rehearsal fixtures')

  test('sends Staff to self-service and denies staff management', async ({ playwright }) => {
    const baseURL = localSignedOrigin()
    const stateDirectory = process.env.ADMIN_E2E_STATE_DIR
    if (!stateDirectory) throw new Error('Use the local signed Staff storage state')

    const staff = await playwright.request.newContext({
      baseURL,
      storageState: join(stateDirectory, 'staff.json'),
    })
    try {
      const session = await staff.get('/api/auth/get-session?disableCookieCache=true', REQUEST)
      expect(session.status()).toBe(200)
      expect(await session.json()).toMatchObject({
        user: { id: 'rehearsal_mb_a_stylist', role: 'staff' },
      })

      const home = await staff.get('/', REQUEST)
      expect(home.status()).toBe(307)
      expect(new URL(home.headers().location ?? '', baseURL).href).toBe(
        new URL('/me/schedule', baseURL).href,
      )

      for (const [path, heading] of [
        ['/me/schedule', 'My Schedule'],
        ['/me/leave', 'My Leave'],
      ] as const) {
        const page = await staff.get(path, REQUEST)
        expect(page.status(), path).toBe(200)
        expect(await page.text()).toContain(`>${heading}</h1>`)
      }

      const { active, branches } = await data<MyBranches>(
        await staff.get('/api/me/branch', REQUEST),
      )
      expect(active).toMatchObject({ id: BRANCH_ID, role: 'staff' })
      expect(branches.map(({ id }) => id)).toEqual([BRANCH_ID])
      const { schedule } = await data<{ schedule: { branchName: string | null }[] }>(
        await staff.get('/api/me/schedule', REQUEST),
      )
      expect(schedule).toHaveLength(7)
      expect([...new Set(schedule.map(({ branchName }) => branchName))]).toEqual([
        'Rayasandra Studio (Rehearsal)',
      ])
      expect(await data(await staff.get('/api/me/leave', REQUEST))).toMatchObject({ leave: [] })
      const leaveDate = '2099-01-15'
      const submitted = await staff.post('/api/me/leave', {
        ...REQUEST,
        data: { date: leaveDate, leaveType: 'casual' },
      })
      expect(submitted.status()).toBe(201)
      const { leave } = await data<{ leave: { id: string } }>(submitted)
      try {
        expect(await data(await staff.get('/api/me/leave', REQUEST))).toMatchObject({
          leave: [{ id: leave.id, date: leaveDate, approvalStatus: 'pending' }],
        })
      } finally {
        expect(await data(await staff.delete(`/api/me/leave/${leave.id}`, REQUEST))).toEqual({
          ok: true,
        })
      }

      for (const path of ['/staff', '/api/staff/all']) {
        expect((await staff.get(path, REQUEST)).status(), path).toBe(403)
      }
    } finally {
      await staff.dispose()
    }
  })
})
