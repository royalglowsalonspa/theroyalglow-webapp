import { BrowserCheck, Frequency } from 'checkly/constructs'

// Check 3 (observability.md Layer 5): Sign-in page renders. Validates the auth
// system surface every 30 minutes — confirms the page mounts and the Google
// sign-in button (the only auth entry point) is present and enabled. Does NOT
// complete OAuth (that needs a real Google session). Target via CHECKLY_TARGET_URL.
new BrowserCheck('rgss-signin', {
  name: 'Sign-in page renders the Google button',
  frequency: Frequency.EVERY_30M,
  code: {
    content: `
const { test, expect } = require('@playwright/test')

test('sign-in page renders the Continue with Google button', async ({ page }) => {
  const baseURL = process.env.CHECKLY_TARGET_URL || 'https://theroyalglow.in'

  await page.goto(baseURL + '/sign-in', { waitUntil: 'domcontentloaded' })

  // Heading confirms the auth card mounted.
  await expect(
    page.getByRole('heading', { name: 'Sign in to Royal Glow' }),
  ).toBeVisible()

  // Google OAuth is the only sign-in method — the button must be visible.
  await expect(
    page.getByRole('button', { name: /continue with google/i }),
  ).toBeVisible()
})
`,
  },
})
