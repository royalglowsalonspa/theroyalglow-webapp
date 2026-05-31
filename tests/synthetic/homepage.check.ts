import { BrowserCheck, Frequency } from 'checkly/constructs'

// Check 1 (observability.md Layer 5): Homepage loads + services render.
// Validates the CDN + SSR path every 10 minutes. Asserts the hero heading
// renders and a "Services" navigation link is present — accessible-role
// selectors mirror the Phase 9 e2e homepage smoke test so they survive
// styling changes. Target is configurable via CHECKLY_TARGET_URL.
new BrowserCheck('rgss-homepage', {
  name: 'Homepage loads + services render',
  frequency: Frequency.EVERY_10M,
  code: {
    content: `
const { test, expect } = require('@playwright/test')

test('homepage renders the hero and a services link', async ({ page }) => {
  const baseURL = process.env.CHECKLY_TARGET_URL || 'https://theroyalglow.in'

  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' })

  // Hero heading — the primary above-the-fold content proving SSR worked.
  await expect(
    page.getByRole('heading', { name: 'Where beauty meets royalty.' }),
  ).toBeVisible()

  // A "Services" link must be reachable from the homepage navigation.
  await expect(
    page.getByRole('link', { name: /services/i }).first(),
  ).toBeVisible()
})
`,
  },
})
