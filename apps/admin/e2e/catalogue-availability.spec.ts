import { expect, test } from '@playwright/test'
import { errorCode, myBranches } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'
import {
  canSeedCatalogue,
  removeCatalogueSeed,
  seedCatalogueAvailability,
} from './fixtures/catalogue-seed'

/************************************************************
 * Catalogue branch availability E2E (catalogue-availability.md, tasks §6)
 *
 * At the branch the browser works in, with one service every branch offers
 * and one only another branch offers (restricted after a booking was made):
 *   - the walk-in form lists the first and not the second;
 *   - the walk-in API refuses the second, naming it, and writes nothing;
 *   - the dashboard lists the booking made before the restriction, with the
 *     service it was booked with, linking to it.
 * It seeds throwaway services, a customer and a booking and deletes them
 * afterwards; opt in with ADMIN_E2E_WRITE_CATALOGUE=1.
 ************************************************************/

/** 'YYYY-MM-DD' → 'DD/MM/YYYY', as the admin shows dates. */
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function availabilityJourney(role: AdminRole) {
  describeAs(role, 'Catalogue branch availability', () => {
    test('only what the branch offers can be chosen, and older bookings are listed', async ({
      page,
    }) => {
      test.skip(
        !canSeedCatalogue(),
        'opt in with ADMIN_E2E_WRITE_CATALOGUE=1: the journey writes to the dev database',
      )
      const { active } = await myBranches(page.request)
      expect(active, 'the signed-in account works in no branch').not.toBeNull()
      if (!active) {
        return
      }

      const seeded = await seedCatalogueAvailability(active.id)
      try {
        await test.step('the walk-in form lists only services this branch offers', async () => {
          await page.goto('/bookings/new')
          // `next dev` compiles the page on its first request.
          await expect(page.getByLabel(seeded.here.name)).toBeVisible({ timeout: 30_000 })
          await expect(page.getByLabel(seeded.elsewhere.name)).toHaveCount(0)
        })

        await test.step('the walk-in API refuses the other branch’s service', async () => {
          const res = await page.request.post('/api/bookings/new', {
            data: {
              branchId: active.id,
              customerId: seeded.customerId,
              serviceType: 'salon',
              bookingDate: seeded.day,
              startTime: '11:00',
              serviceIds: [seeded.elsewhere.id],
            },
          })
          expect(res.status()).toBe(400)
          expect(await errorCode(res)).toBe('VALIDATION_ERROR')
          const body = (await res.json()) as { error: { message: string } }
          expect(body.error.message).toBe(
            `${seeded.elsewhere.name} isn't offered at ${active.name}. Choose another service, or book at a branch that offers it.`,
          )
        })

        await test.step('the dashboard lists the booking made before the change', async () => {
          await page.goto('/')
          const panel = page.getByRole('region', { name: /no longer offers/ })
          await expect(panel).toBeVisible({ timeout: 30_000 })
          const item = panel.getByRole('listitem').filter({ hasText: seeded.customerName })
          await expect(item.getByRole('link')).toHaveText(
            `${ddmmyyyy(seeded.day)} · 11:00 AM — ${seeded.customerName}`,
          )
          await expect(item).toContainText(`Booked: ${seeded.elsewhere.name}`)
          await item.getByRole('link').click()
          await expect(
            page.getByRole('heading', { level: 1, name: seeded.bookingNumber }),
          ).toBeVisible({ timeout: 30_000 })
        })
      } finally {
        await removeCatalogueSeed()
      }
    })
  })
}

for (const role of ['receptionist', 'developer'] as const) {
  availabilityJourney(role)
}
