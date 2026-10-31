import { expect, type Page, test } from '@playwright/test'
import { data, errorCode, myBranches } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'
import {
  canSeedMemberships,
  membershipTotals,
  openDayAhead,
  removeSeed,
  seedMembership,
} from './fixtures/membership-seed'

/************************************************************
 * Membership sessions E2E (membership-scheduling.md, §4 slice 1)
 *
 * The write journey, at the branch the browser works in:
 *   - a membership shows its free, held and used minutes;
 *   - Record Session starts the session now, done by the one person chosen
 *     (§4 slice 2): the booking is in progress and the database holds its
 *     minutes, so they are neither free nor used;
 *   - the session's booking completes it with no payment method: the minutes
 *     are used and the ₹0 session invoice is issued;
 *   - the membership then shows the minutes used and nothing held.
 * And booked ahead: Book ahead holds the minutes for a day and time the
 * branch is open; its booking can't start before its day, and cancelling it
 * gives the minutes back.
 * It seeds a throwaway membership and deletes everything afterwards; opt in
 * with ADMIN_E2E_WRITE_MEMBERSHIP_SESSIONS=1 (each journey takes an invoice
 * number).
 *
 * Always: the start and record endpoints refuse a booking or membership that
 * isn't there, a page rendered for another branch, a malformed body and a
 * session that names nobody, before writing anything.
 ************************************************************/

type StaffOption = { id: string; name: string; designation: string }

/** The value of one of the hours-balance figures ("Used", "Held", "Remaining", "Total"). */
function figure(page: Page, label: string) {
  return page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd')
}

async function openMembership(page: Page, id: string, number: string): Promise<void> {
  await page.goto(`/memberships/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible({
    timeout: 30_000,
  })
}

function sessionJourney(role: AdminRole) {
  describeAs(role, 'Membership sessions', () => {
    test('a session starts now, holds its minutes and uses them when it completes', async ({
      page,
    }) => {
      test.skip(
        !canSeedMemberships(),
        'opt in with ADMIN_E2E_WRITE_MEMBERSHIP_SESSIONS=1: the journey writes to the dev database',
      )
      const { active } = await myBranches(page.request)
      expect(active, 'the signed-in account works in no branch').not.toBeNull()
      if (!active) {
        return
      }
      const { staff } = await data<{ staff: StaffOption[] }>(await page.request.get('/api/staff'))
      const [assignee] = staff
      expect(assignee, `${active.name} has nobody to assign`).toBeDefined()
      if (!assignee) {
        return
      }

      const seeded = await seedMembership(active.id, 120)
      try {
        await test.step('the membership has all its minutes free', async () => {
          await openMembership(page, seeded.id, seeded.number)
          await expect(figure(page, 'Remaining')).toHaveText('2h 0m')
          await expect(figure(page, 'Held')).toHaveText('0h 0m')
          await expect(page.getByText('No sessions recorded yet.')).toBeVisible()
        })

        await test.step('Record Session starts it and holds 30 minutes', async () => {
          await page.getByRole('button', { name: 'Record Session' }).click()
          const panel = page.getByRole('dialog', { name: 'Record Membership Session' })
          await panel.getByRole('checkbox').first().click()
          await panel.getByLabel('Duration (min)').fill('30')
          // One person does the whole session, and it starts now, so the form
          // asks who (0028). Options follow GET /api/staff; two people may
          // share a name, so pick by position.
          const picker = panel.getByRole('combobox', { name: 'Who is doing it' })
          await picker.click()
          await page.getByRole('option').nth(0).click()
          await expect(picker).toHaveText(`${assignee.name} (${assignee.designation})`)
          await expect(panel.getByText(/Start the session now and hold 0h 30m/)).toBeVisible()
          await panel.getByRole('button', { name: 'Record Session' }).click()

          await expect(page.getByText('Session started')).toBeVisible({ timeout: 30_000 })
          await expect(figure(page, 'Held')).toHaveText('0h 30m')
          await expect(figure(page, 'Remaining')).toHaveText('1h 30m')
          await expect(figure(page, 'Used')).toHaveText('0h 0m')
          await expect(page.getByRole('row').filter({ hasText: 'In Progress' })).toHaveCount(1)
          // The database keeps the same totals.
          expect(await membershipTotals(seeded.id)).toEqual({ used: 0, reserved: 30 })
        })

        await test.step('its booking completes it with no payment method', async () => {
          await page.getByRole('link', { name: /· booking BK-/ }).click()
          await expect(page.getByText('Session in progress')).toBeVisible({ timeout: 30_000 })
          await expect(page.getByText('SPA membership hours')).toBeVisible()
          await expect(page.getByRole('radiogroup', { name: 'Payment method' })).toHaveCount(0)
          await expect(page.getByRole('button', { name: 'Mark No-Show' })).toHaveCount(0)

          await page.getByRole('button', { name: 'Complete Session' }).click()

          // `next dev` compiles the route on its first request.
          await expect(page.getByText('Session completed', { exact: true })).toBeVisible({
            timeout: 30_000,
          })
          await expect(page.getByText(/₹0 session invoice/)).toBeVisible()
          await expect(page.getByText('1h 30m left on the membership')).toBeVisible()
          expect(await membershipTotals(seeded.id)).toEqual({ used: 30, reserved: 0 })
        })

        await test.step('the membership shows the minutes used and nothing held', async () => {
          await openMembership(page, seeded.id, seeded.number)
          await expect(figure(page, 'Used')).toHaveText('0h 30m')
          await expect(figure(page, 'Held')).toHaveText('0h 0m')
          await expect(figure(page, 'Remaining')).toHaveText('1h 30m')
          await expect(page.getByRole('row').filter({ hasText: 'Completed' })).toHaveCount(1)
          await expect(page.getByText('1 session · 0h 30m used')).toBeVisible()
        })
      } finally {
        await removeSeed()
      }
    })

    test('a session booked ahead holds its minutes until its booking is cancelled', async ({
      page,
    }) => {
      test.skip(
        !canSeedMemberships(),
        'opt in with ADMIN_E2E_WRITE_MEMBERSHIP_SESSIONS=1: the journey writes to the dev database',
      )
      const { active } = await myBranches(page.request)
      expect(active, 'the signed-in account works in no branch').not.toBeNull()
      if (!active) {
        return
      }
      const day = await openDayAhead(active.id)
      const [y, m, d] = day.split('-')
      const shown = `${d}/${m}/${y}`

      const seeded = await seedMembership(active.id, 120)
      try {
        await test.step('Book ahead books it for the day and time, holding its minutes', async () => {
          await openMembership(page, seeded.id, seeded.number)
          await page.getByRole('button', { name: 'Record Session' }).click()
          const panel = page.getByRole('dialog', { name: 'Record Membership Session' })
          await panel.getByRole('checkbox').first().click()
          await panel.getByLabel('Duration (min)').fill('60')
          await panel.getByRole('radio', { name: 'Book ahead' }).click()
          await panel.getByLabel('Date').fill(day)
          await panel.getByRole('combobox', { name: 'Start time' }).click()
          await page.getByRole('option', { name: '11:00 AM', exact: true }).click()
          // Who can do it then; pick the first free person.
          const picker = panel.getByRole('combobox', { name: 'Who is doing it' })
          await picker.click()
          await page.locator('[role="option"]:not([aria-disabled="true"])').first().click()
          await expect(panel.getByText(`Book the session for ${shown} at 11:00 AM`)).toBeVisible()
          await panel.getByRole('button', { name: 'Book Session', exact: true }).click()

          await expect(page.getByText(`Session booked for ${shown} at 11:00 AM`)).toBeVisible({
            timeout: 30_000,
          })
          await expect(figure(page, 'Held')).toHaveText('1h 0m')
          await expect(figure(page, 'Remaining')).toHaveText('1h 0m')
          expect(await membershipTotals(seeded.id)).toEqual({ used: 0, reserved: 60 })
        })

        await test.step('its booking starts on its day; cancelling it gives the minutes back', async () => {
          await page.getByRole('link', { name: /· booking BK-/ }).click()
          // A later day's session can't start today.
          await expect(page.getByRole('button', { name: 'Start Session' })).toBeDisabled({
            timeout: 30_000,
          })
          await expect(
            page.getByText(`It starts on ${shown}. To start it now, move it to today.`),
          ).toBeVisible()

          await page.getByRole('button', { name: 'Cancel booking', exact: true }).click()
          await page.getByLabel('Cancellation Reason').fill('The member asked to cancel.')
          await page.getByRole('button', { name: 'Confirm Cancellation', exact: true }).click()
          await expect(page.getByText('This booking was cancelled.')).toBeVisible({
            timeout: 30_000,
          })
          expect(await membershipTotals(seeded.id)).toEqual({ used: 0, reserved: 0 })
        })

        await test.step('the membership has all its minutes free again', async () => {
          await openMembership(page, seeded.id, seeded.number)
          await expect(figure(page, 'Held')).toHaveText('0h 0m')
          await expect(figure(page, 'Remaining')).toHaveText('2h 0m')
        })
      } finally {
        await removeSeed()
      }
    })

    test('refuses a session or start that isn’t there, a stale page or a bad body, writing nothing', async ({
      page,
    }) => {
      const { active } = await myBranches(page.request)
      if (!active) {
        throw new Error('the signed-in account works in no branch')
      }

      const missing = await page.request.post('/api/bookings/bk_e2e_missing/start', {
        data: { branchId: active.id },
      })
      expect(missing.status()).toBe(404)

      const stale = await page.request.post('/api/bookings/bk_e2e_missing/start', {
        data: { branchId: 'branch_e2e_elsewhere' },
      })
      expect(stale.status()).toBe(409)
      expect(await errorCode(stale)).toBe('BRANCH_CONTEXT_CHANGED')

      const malformed = await page.request.post('/api/bookings/bk_e2e_missing/start', {
        data: {},
      })
      expect(malformed.status()).toBe(400)

      // Who can take a slot starting now says why not, per person (slice 2b);
      // a booking elsewhere is not found, and a mixed question is refused.
      const now = await data<{ staff: Array<StaffOption & { busy: unknown }> }>(
        await page.request.get('/api/staff?minutes=30&kind=spa'),
      )
      expect(now.staff.length).toBeGreaterThan(0)
      for (const person of now.staff) {
        expect(person).toHaveProperty('busy')
      }
      expect((await page.request.get('/api/staff?booking=bk_e2e_missing')).status()).toBe(404)
      expect(
        (await page.request.get('/api/staff?booking=bk_e2e_missing&minutes=30&kind=spa')).status(),
      ).toBe(400)

      // A session names the person doing it before anything is read (0028).
      const lines = [{ serviceId: 'svc_e2e', durationMinutes: 30 }]
      const nobody = await page.request.post('/api/memberships/mem_e2e_missing/sessions', {
        data: { branchId: active.id, services: lines },
      })
      expect(nobody.status()).toBe(400)

      const noMembership = await page.request.post('/api/memberships/mem_e2e_missing/sessions', {
        data: { branchId: active.id, staffId: 'stf_e2e', services: lines },
      })
      expect(noMembership.status()).toBe(404)
    })
  })
}

for (const role of ['receptionist', 'developer'] as const) {
  sessionJourney(role)
}
