// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Opt-in local Playwright rehearsal.
import { expect, test } from '@playwright/test'
import type { UpsertScheduleInput } from '@rgss/types'
import { data, myBranches, staffPage } from './fixtures/admin-api'
import { roleStatePath } from './fixtures/auth'
import { localSignedOrigin } from './fixtures/local-signed-origin'

const BRANCH = 'rehearsal_mb_a'
const STYLIST = 'rehearsal_mb_staff_a_stylist'
const OTHER_STYLIST = 'rehearsal_mb_staff_b_stylist'
const WEEK = '/api/schedule?weekStart=2099-05-31'
const PROFILE = `/api/staff/${STYLIST}`
const REQUEST = { maxRedirects: 0, timeout: 10_000 }

type WeekGrid = {
  branchId: string
  staff: { staff: { id: string }; schedule: UpsertScheduleInput['entries'] }[]
}

test.use({ trace: 'off' })
test.describe('Local signed staffing', () => {
  test.describe.configure({ retries: 0, timeout: 75_000 })
  test.skip(process.env.ADMIN_E2E_LOCAL_HANDOVER !== '1', 'requires local rehearsal fixtures')

  test('saves service capabilities and a shift that changes booking assignment availability', async ({
    playwright,
  }) => {
    const owner = await playwright.request.newContext({
      baseURL: localSignedOrigin(),
      storageState: roleStatePath('owner'),
    })
    try {
      const { active, branches } = await myBranches(owner)
      expect(active).toMatchObject({ id: BRANCH, role: 'owner' })
      expect(branches.map(({ id }) => id)).toEqual([BRANCH, 'rehearsal_mb_b'])
      const { staff } = await staffPage(owner)
      expect(staff.map(({ designation }) => designation).sort()).toEqual([
        'manager',
        'receptionist',
        'stylist',
        'therapist',
      ])
      expect((await owner.get(`/api/staff/${OTHER_STYLIST}`, REQUEST)).status()).toBe(404)

      const readProfile = async () =>
        (await data<{ staff: { serviceIds: string[] } }>(await owner.get(PROFILE, REQUEST))).staff
      const readSchedule = async (): Promise<UpsertScheduleInput['entries']> => {
        const grid = await data<WeekGrid>(await owner.get(WEEK, REQUEST))
        expect(grid.branchId).toBe(BRANCH)
        const member = grid.staff.find(({ staff: person }) => person.id === STYLIST)
        if (!member) throw new Error('The synthetic Stylist is missing from the weekly schedule')
        return member.schedule.map(({ dayOfWeek, isWorking, startTime, endTime }) => ({
          dayOfWeek,
          isWorking,
          startTime: startTime?.slice(0, 5) ?? null,
          endTime: endTime?.slice(0, 5) ?? null,
        }))
      }
      const setServices = async (serviceIds: string[]) =>
        data(await owner.patch(PROFILE, { ...REQUEST, data: { branchId: BRANCH, serviceIds } }))
      const setSchedule = async (entries: UpsertScheduleInput['entries']) =>
        data<{ ok: true; reassignments: number }>(
          await owner.put('/api/schedule', {
            ...REQUEST,
            data: { branchId: BRANCH, staffId: STYLIST, entries },
          }),
        )
      const availability = async (start: string) => {
        const { staff: candidates } = await data<{
          staff: { id: string; busy: { reason: string } | null }[]
        }>(
          await owner.get('/api/staff', {
            ...REQUEST,
            params: { kind: 'salon', minutes: 30, date: '2099-06-01', start },
          }),
        )
        return candidates.find(({ id }) => id === STYLIST)
      }

      const originalServices = (await readProfile()).serviceIds
      const firstService = originalServices[0]
      if (!firstService) {
        throw new Error('The synthetic Stylist needs a service capability')
      }
      const originalSchedule = await readSchedule()
      expect(originalSchedule).toHaveLength(7)
      expect(originalSchedule.find(({ dayOfWeek }) => dayOfWeek === 1)).toMatchObject({
        isWorking: true,
        startTime: '10:00',
      })
      expect(await availability('11:00')).toMatchObject({ busy: null })
      const changedSchedule = originalSchedule.map((entry) =>
        entry.dayOfWeek === 1 ? { ...entry, startTime: '12:00' } : entry,
      )

      try {
        await setServices([])
        expect((await readProfile()).serviceIds).toEqual([])
        await setServices([firstService])
        expect((await readProfile()).serviceIds).toEqual([firstService])
        expect(await setSchedule(changedSchedule)).toEqual({ ok: true, reassignments: 0 })
        expect(await readSchedule()).toEqual(changedSchedule)
        expect(await availability('11:00')).toMatchObject({ busy: { reason: 'off_schedule' } })
        expect(await availability('13:00')).toMatchObject({ busy: null })
      } finally {
        await Promise.all([setServices(originalServices), setSchedule(originalSchedule)])
      }
    } finally {
      await owner.dispose()
    }
  })
})
