import { expect, type Page, test } from '@playwright/test'
import { errorCode, myBranches } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'
import {
  bookingRow,
  canSeedBookingChanges,
  removeBookingSeed,
  seedClosedDayBooking,
} from './fixtures/booking-seed'

/************************************************************
 * Salon booking changes E2E (membership-scheduling.md, §4 slice 3)
 *
 * The write journey, at the branch the browser works in:
 *   - the dashboard lists a confirmed booking on a day the branch is closed,
 *     linking to it;
 *   - Move booking puts it on an open day at a half-hour start, without
 *     using up one of the customer's reschedules, and the dashboard stops
 *     listing it;
 *   - Cancel booking cancels it with the reason the customer sees.
 * It seeds a throwaway customer, booking and closure and deletes everything
 * afterwards; opt in with ADMIN_E2E_WRITE_BOOKING_CHANGES=1 (the closure
 * closes the real branch on that day meanwhile).
 *
 * Always: the move and cancel endpoints refuse a booking that isn't there, a
 * page rendered for another branch and a malformed body, writing nothing.
 ************************************************************/

/** 'YYYY-MM-DD' → 'DD/MM/YYYY', as the admin shows dates. */
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** The value of one of the booking's fields ("Date", "Time", …). */
function field(page: Page, label: string) {
  return page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd')
}

async function openBooking(page: Page, id: string, number: string): Promise<void> {
  await page.goto(`/bookings/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible({
    timeout: 30_000,
  })
}

function changesJourney(role: AdminRole) {
  describeAs(role, 'Salon booking changes', () => {
    test('a booking on a closed day is listed, moved off it, then cancelled', async ({ page }) => {
      test.skip(
        !canSeedBookingChanges(),
        'opt in with ADMIN_E2E_WRITE_BOOKING_CHANGES=1: the journey writes to the dev database',
      )
      const { active } = await myBranches(page.request)
      expect(active, 'the signed-in account works in no branch').not.toBeNull()
      if (!active) {
        return
      }

      const seeded = await seedClosedDayBooking(active.id)
      try {
        await test.step('the dashboard lists it with the closure', async () => {
          await page.goto('/')
          const panel = page.getByRole('region', { name: /on (a )?closed days?/ })
          await expect(panel).toBeVisible({ timeout: 30_000 })
          const link = panel.getByRole('link', { name: new RegExp(seeded.customerName) })
          await expect(link).toHaveText(
            `${ddmmyyyy(seeded.closedDay)} · 11:00 AM — ${seeded.customerName}`,
          )
          await expect(
            panel.getByRole('listitem').filter({ hasText: seeded.customerName }),
          ).toContainText(`Closed: ${seeded.closureName}`)
          await link.click()
          await expect(page.getByRole('heading', { level: 1, name: seeded.number })).toBeVisible({
            timeout: 30_000,
          })
        })

        await test.step('Move booking puts it on an open day', async () => {
          await page.getByRole('button', { name: 'Move booking', exact: true }).click()
          const move = page.getByRole('button', { name: 'Move Booking', exact: true })
          // Nothing to move until the date or time changes.
          await expect(move).toBeDisabled()
          await page.getByLabel('New date').fill(seeded.openDay)
          await page.getByRole('combobox', { name: 'New start time' }).click()
          await page.getByRole('option', { name: '11:30 AM', exact: true }).click()
          await move.click()

          // `next dev` compiles the route on its first request.
          await expect(
            page.getByText(`Booking moved to ${ddmmyyyy(seeded.openDay)} at 11:30 AM`),
          ).toBeVisible({ timeout: 30_000 })
          await expect(field(page, 'Date')).toHaveText(ddmmyyyy(seeded.openDay))
          await expect(field(page, 'Time')).toHaveText('11:30 AM – 12:30 PM')
          // The salon moved it: none of the customer's reschedules used.
          expect(await bookingRow(seeded.id)).toEqual({
            date: seeded.openDay,
            start: '11:30',
            status: 'confirmed',
            reschedules: 0,
            reason: null,
          })
        })

        await test.step('the dashboard stops listing it', async () => {
          await page.goto('/')
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
          await expect(
            page.getByRole('link', { name: new RegExp(seeded.customerName) }),
          ).toHaveCount(0)
        })

        await test.step('Cancel booking cancels it with the reason', async () => {
          await openBooking(page, seeded.id, seeded.number)
          await page.getByRole('button', { name: 'Cancel booking', exact: true }).click()
          await page
            .getByLabel('Cancellation Reason')
            .fill('The salon is closed for a staff event.')
          await page.getByRole('button', { name: 'Confirm Cancellation', exact: true }).click()

          await expect(page.getByText('Booking cancelled', { exact: true })).toBeVisible({
            timeout: 30_000,
          })
          await expect(page.getByText('This booking was cancelled.')).toBeVisible()
          await expect(page.getByText('The salon is closed for a staff event.')).toBeVisible()
          expect(await bookingRow(seeded.id)).toMatchObject({
            status: 'cancelled',
            reason: 'The salon is closed for a staff event.',
          })
        })
      } finally {
        await removeBookingSeed()
      }
    })

    test('refuses a move or cancel that isn’t there, a stale page or a bad body', async ({
      page,
    }) => {
      const { active } = await myBranches(page.request)
      if (!active) {
        throw new Error('the signed-in account works in no branch')
      }
      const move = (body: Record<string, unknown>) =>
        page.request.post('/api/bookings/bk_e2e_missing/reschedule', { data: body })
      const cancel = (body: Record<string, unknown>) =>
        page.request.post('/api/bookings/bk_e2e_missing/cancel', { data: body })

      const slot = { bookingDate: '2099-01-05', startTime: '11:00' }
      expect((await move({ branchId: active.id, ...slot })).status()).toBe(404)
      const staleMove = await move({ branchId: 'branch_e2e_elsewhere', ...slot })
      expect(staleMove.status()).toBe(409)
      expect(await errorCode(staleMove)).toBe('BRANCH_CONTEXT_CHANGED')
      expect((await move({ branchId: active.id, bookingDate: '05/01/2099' })).status()).toBe(400)

      expect((await cancel({ branchId: active.id, reason: 'Closed' })).status()).toBe(404)
      const staleCancel = await cancel({ branchId: 'branch_e2e_elsewhere', reason: 'Closed' })
      expect(staleCancel.status()).toBe(409)
      expect(await errorCode(staleCancel)).toBe('BRANCH_CONTEXT_CHANGED')
      expect((await cancel({ branchId: active.id, reason: '   ' })).status()).toBe(400)
    })
  })
}

for (const role of ['receptionist', 'developer'] as const) {
  changesJourney(role)
}
