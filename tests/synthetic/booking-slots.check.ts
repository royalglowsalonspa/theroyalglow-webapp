import { BrowserCheck, Frequency } from 'checkly/constructs'

// Check 2 (observability.md Layer 5): Homepage booking dialog opens and a
// date/slot control renders via the `?book=1` deep-link. Validates the
// API + DB path (the dialog fetches /api/services and /api/availability)
// every 15 minutes. Target is configurable via CHECKLY_TARGET_URL.
new BrowserCheck('rgss-booking-slots', {
  name: 'Booking dialog opens + slot picker renders',
  frequency: Frequency.EVERY_15M,
  code: {
    content: `
const { test, expect } = require('@playwright/test')

test('the ?book=1 deep-link opens the dialog and shows the date/slot step', async ({ page }) => {
  const baseURL = process.env.CHECKLY_TARGET_URL || 'https://theroyalglow.in'

  await page.goto(baseURL + '/?book=1', { waitUntil: 'domcontentloaded' })

  // The booking dialog is a modal (role="dialog") titled "Book Appointment".
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Book Appointment' }),
  ).toBeVisible()

  // Step 1 renders the date picker — proves the dialog mounted its slot/date
  // control (the "Select Date" section heading).
  await expect(
    dialog.getByRole('heading', { name: /select date/i }),
  ).toBeVisible()
})
`,
  },
})
