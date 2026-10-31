import { expect, type Page, test } from '@playwright/test'
import { activeBranch, data, errorCode } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'

/************************************************************
 * Tax rates E2E (multi-branch R6.4, TX-01, TX-08, TX-10)
 *
 * As the Developer:
 *   - /settings/tax lists the active branch's rates exactly as
 *     GET /api/tax-versions returns them, with the branch's invoice number
 *     format and the invoicing mode;
 *   - the Add Rate panel catches a rate above 28% and, for a code that already
 *     has a rate, offers tomorrow as the earliest start, without sending;
 *   - the API refuses a change of rate starting today, a review that isn't
 *     one and a request rendered for another branch, and the list is unchanged;
 *   - Settings shows the same invoicing mode and links to the rates.
 * For every other role, the page and the API are closed.
 *
 * Nothing here writes data: every request the suite sends is refused before
 * anything is written, and the panel is cancelled without saving. Marking a
 * rate reviewed can't be undone, so it is covered by unit and live suites only.
 ************************************************************/

type TaxVersionView = {
  id: string
  sacCode: string
  rateBps: number
  reviewStatus: 'provisional' | 'reviewed'
  reason: string
  state: 'in_force' | 'scheduled' | 'replaced'
}

type TaxScreen = {
  branchId: string
  branchName: string
  issuer: {
    legalName: string | null
    gstin: string | null
    invoicePrefix: string
    prefixFixed: boolean
  }
  invoicingLive: boolean
  versions: TaxVersionView[]
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' on the IST calendar, `days` from now. */
function istDate(days = 0): string {
  return new Date(Date.now() + IST_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10)
}

/** "2627" for 1 April 2026 to 31 March 2027, on the IST calendar. */
function financialYearNow(): string {
  const wall = new Date(Date.now() + IST_OFFSET_MS)
  const start = wall.getUTCMonth() >= 3 ? wall.getUTCFullYear() : wall.getUTCFullYear() - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

async function taxScreen(page: Page): Promise<TaxScreen> {
  return data<TaxScreen>(await page.request.get('/api/tax-versions'))
}

/** Open the Tax screen and wait until it has loaded. */
async function openTaxScreen(page: Page, screen: TaxScreen): Promise<void> {
  await page.goto('/settings/tax')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Tax Rates · ${screen.branchName}`,
  )
}

describeAs('developer', 'Tax rates', () => {
  test('lists the active branch’s rates as the API returns them', async ({ page }) => {
    const branch = await activeBranch(page.request)
    const screen = await taxScreen(page)
    expect(screen.branchId).toBe(branch.id)

    await openTaxScreen(page, screen)

    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(screen.versions.length)
    for (const code of new Set(screen.versions.map((v) => v.sacCode))) {
      const expected = screen.versions.filter((v) => v.sacCode === code).length
      await expect(rows.filter({ hasText: code })).toHaveCount(expected)
    }
    for (const version of screen.versions) {
      const percent = `${version.rateBps / 100}%`
      await expect(
        rows.filter({ hasText: version.sacCode }).filter({ hasText: percent }).first(),
      ).toBeVisible()
    }
    const inForce = screen.versions.filter((v) => v.state === 'in_force').length
    await expect(rows.filter({ hasText: 'In Force' })).toHaveCount(inForce)

    await expect(
      page.getByText(`${screen.issuer.invoicePrefix}/${financialYearNow()}/000123`, {
        exact: false,
      }),
    ).toBeVisible()
    await expect(
      page.getByText(
        screen.invoicingLive
          ? /^Live invoicing\./
          : /^Test invoicing: invoices say their rates are provisional\./,
      ),
    ).toBeVisible()
  })

  test('the Add Rate panel catches a bad rate and sends nothing', async ({ page }) => {
    const screen = await taxScreen(page)
    await openTaxScreen(page, screen)

    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/tax-versions')) {
        posts.push(request.url())
      }
    })

    await page.getByRole('button', { name: '+ Add Rate' }).click()
    const panel = page.getByRole('dialog', { name: `Add a rate at ${screen.branchName}` })
    await expect(panel).toBeVisible()

    // The default code is the first reviewed one; a change to it can't start
    // before tomorrow when it already has a rate.
    const startsOn = panel.getByLabel('Starts on')
    if (screen.versions.some((v) => v.sacCode === '999721')) {
      await expect(startsOn).toHaveAttribute('min', istDate(1))
    }

    await panel.getByLabel('GST rate (%)').fill('29')
    await panel.getByRole('button', { name: 'Add Rate' }).click()
    await expect(panel.getByText('Enter a rate from 0% to 28%.')).toBeVisible()

    await panel.getByLabel('GST rate (%)').fill('5')
    await panel.getByRole('button', { name: 'Add Rate' }).click()
    await expect(panel.getByText('Say why the rate changes.')).toBeVisible()

    await panel.getByRole('button', { name: 'Cancel' }).click()
    await expect(panel).toBeHidden()
    expect(posts).toEqual([])
  })

  test('the API refuses what it must, before writing anything', async ({ page }) => {
    const before = await taxScreen(page)
    const existing = before.versions.find((v) => v.state === 'in_force')
    test.skip(!existing, 'the active branch has no rate in force')
    if (!existing) {
      return
    }

    // A change of rate starting today.
    const today = await page.request.post('/api/tax-versions', {
      data: {
        branchId: before.branchId,
        sacCode: existing.sacCode,
        rateBps: existing.rateBps === 1800 ? 1200 : 1800,
        effectiveFrom: istDate(0),
        reason: 'E2E: a change that must be refused',
      },
    })
    expect(today.status()).toBe(400)
    expect((await today.json()).error.details).toEqual({
      effectiveFrom: ['Choose tomorrow or later'],
    })

    // A request rendered for another branch.
    const elsewhere = await page.request.post('/api/tax-versions', {
      data: {
        branchId: 'e2e-no-such-branch',
        sacCode: existing.sacCode,
        rateBps: 1800,
        effectiveFrom: istDate(30),
        reason: 'E2E: rendered for another branch',
      },
    })
    expect(elsewhere.status()).toBe(409)
    expect(await errorCode(elsewhere)).toBe('BRANCH_CONTEXT_CHANGED')

    // Anything but a review.
    const notReview = await page.request.patch(`/api/tax-versions/${existing.id}`, {
      data: { branchId: before.branchId, reviewed: false },
    })
    expect(notReview.status()).toBe(400)

    const after = await taxScreen(page)
    expect(after.versions.map((v) => [v.id, v.rateBps, v.reviewStatus])).toEqual(
      before.versions.map((v) => [v.id, v.rateBps, v.reviewStatus]),
    )
  })

  test('Settings shows the invoicing mode and links to the rates', async ({ page }) => {
    const screen = await taxScreen(page)

    await page.goto('/settings')
    const live = page.getByRole('switch', { name: 'Live invoicing' })
    // Settings loads the branch's settings first; a dev server compiling on
    // first visit can take a while to show it.
    await expect(live).toHaveAttribute('aria-checked', String(screen.invoicingLive), {
      timeout: 30_000,
    })

    await page.getByRole('link', { name: /Tax rates for the active branch/ }).click()
    await expect(page).toHaveURL(/\/settings\/tax$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `Tax Rates · ${screen.branchName}`,
    )
  })
})

const OTHER_ROLES: readonly AdminRole[] = ['owner', 'manager', 'receptionist']

for (const role of OTHER_ROLES) {
  describeAs(role, 'Tax rates', () => {
    test('are closed to anyone but the Developer', async ({ page }) => {
      const response = await page.goto('/settings/tax', { waitUntil: 'domcontentloaded' })
      // The middleware answers 403; an impersonating dev server skips it, and
      // the page itself refuses.
      if (response?.status() !== 403) {
        await expect(page.getByText("Tax rates aren't available here")).toBeVisible()
      }

      const api = await page.request.get('/api/tax-versions')
      expect(api.status()).toBe(403)
      const write = await page.request.post('/api/tax-versions', {
        data: {
          branchId: (await activeBranch(page.request)).id,
          sacCode: '999721',
          rateBps: 1800,
          effectiveFrom: istDate(30),
          reason: 'E2E: not the Developer',
        },
      })
      expect(write.status()).toBe(403)
    })
  })
}
