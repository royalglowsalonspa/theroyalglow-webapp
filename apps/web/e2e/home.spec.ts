import { expect, test } from '@playwright/test'

// Homepage smoke test. Kept intentionally small and resilient: it asserts the
// hero heading renders and the primary "Book Now" CTA is visible, then that the
// `/?book=1` deep-link opens the booking dialog (role="dialog", titled
// "Book Appointment"). Selectors use accessible roles/names so they survive
// styling changes.

test('homepage renders the hero and a Book Now CTA', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Where beauty meets royalty.' }),
  ).toBeVisible()

  await expect(
    page.getByRole('link', { name: /book now/i }).first(),
  ).toBeVisible()
})

test('the /?book=1 deep-link opens the booking dialog', async ({ page }) => {
  await page.goto('/?book=1')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Book Appointment' }),
  ).toBeVisible()
})
