import { BrowserCheck, Frequency } from 'checkly/constructs'

// Check 2 (observability.md Layer 5): Homepage booking dialog opens via the
// `?book=1` deep-link and loads time slots for a date. Validates the API + DB
// path (the dialog fetches /api/branches, /api/services and /api/availability)
// every 15 minutes. Read-only: it stops at the time step and never submits.
// Target is configurable via CHECKLY_TARGET_URL.
//
// It picks a date and waits for the times because rendering the date strip is
// not enough: the strip rendered normally while every availability request
// failed with 400 "Invalid availability query" and no customer could book.
new BrowserCheck('rgss-booking-slots', {
  name: 'Booking dialog opens + time slots load',
  frequency: Frequency.EVERY_15M,
  code: {
    content: `
const { test, expect } = require('@playwright/test')

test('the ?book=1 deep-link opens the dialog and loads time slots', async ({ page }) => {
  const baseURL = process.env.CHECKLY_TARGET_URL || 'https://theroyalglow.in'

  await page.goto(baseURL + '/?book=1', { waitUntil: 'domcontentloaded' })

  // The booking dialog is a modal (role="dialog") titled "Book Appointment".
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Book Appointment' }),
  ).toBeVisible()

  // A branch taking bookings is preselected.
  await expect(dialog.getByRole('combobox', { name: /branch/i })).toBeVisible()

  // Pick tomorrow, the second date. The check's browser may not be on IST,
  // and its "today" can already be a past date in IST, which the API rejects.
  await dialog.locator('button[aria-pressed]').nth(1).click()

  // The day's times load (the grid always starts at 10:00, available or not).
  await expect(
    dialog.getByRole('button', { name: '10:00', exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})
`,
  },
})
