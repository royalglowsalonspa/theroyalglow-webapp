import { expect, test } from '@playwright/test'

// Homepage smoke test. Kept intentionally small and resilient: it asserts the
// hero heading renders and the primary "Book Now" CTA is visible, then that the
// `/?book=1` deep-link opens the booking dialog (role="dialog", titled
// "Book Appointment"). Selectors use accessible roles/names so they survive
// styling changes.

test('homepage renders the hero and a Book Now CTA', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Where beauty meets royalty.' })).toBeVisible()

  await expect(page.getByRole('link', { name: /book now/i }).first()).toBeVisible()
})

test('the /?book=1 deep-link opens the booking dialog', async ({ page }) => {
  await page.goto('/?book=1')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Book Appointment' })).toBeVisible()
})

// Read-only: stops at the time step and never submits a booking. Needs a
// database with at least one operational branch (the seed creates Rayasandra).
test('the booking dialog loads times for the preselected branch', async ({ page }) => {
  await page.goto('/?book=1')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox', { name: /branch/i })).toBeVisible()

  // Tomorrow, the second date: in a browser timezone behind IST, "today" can
  // already be a past date in IST, which the API rejects.
  await dialog.locator('button[aria-pressed]').nth(1).click()

  // The regression this guards: the dialog sent no branch, so every customer
  // got "Invalid availability query" instead of times.
  await expect(dialog.getByRole('button', { name: '10:00', exact: true })).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})
