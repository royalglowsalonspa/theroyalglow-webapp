import { expect, type Page, test } from '@playwright/test'
import { activeBranch, data, errorCode, myBranches, switchBranch } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'

/************************************************************
 * Branch booking settings E2E (multi-branch R1.1, R6.3)
 *
 * As the Developer:
 *   - /settings shows the active branch's hours, booking rules, current
 *     revision and history exactly as GET /api/settings returns them;
 *   - switching branch shows that branch's own settings;
 *   - the API refuses a save from a stale revision, one rendered for another
 *     branch and an invalid value, and the revision is unchanged.
 * For every other role, the page and the API are closed.
 *
 * Nothing here writes data: every save the suite sends is refused before
 * anything is written, and a branch switch changes only this browser's
 * active-branch cookie (switched back afterwards). Saving a revision is
 * covered by the unit and live suites.
 ************************************************************/

type BookingRules = {
  minAdvanceLeadTimeMinutes: number
  maxAdvanceBookingDays: number
  cancellationCutoffHours: number
  maxActiveBookingsPerCustomer: number
  rescheduleCutoffHours: number
  maxReschedulesPerBooking: number
}

type SettingsScreen = {
  branch: {
    branchId: string
    branchName: string
    revision: number
    savedAt: string | null
    savedByName: string | null
    businessHours: Record<
      string,
      { open: string | null; close: string | null; closed: boolean }
    > | null
    bookingRules: BookingRules | null
  }
  history: { revision: number; section: string | null }[]
  invoicing: { live: boolean }
}

const RULE_LABELS: [keyof BookingRules, string][] = [
  ['minAdvanceLeadTimeMinutes', 'Lead time (minutes)'],
  ['maxAdvanceBookingDays', 'Booking window (days)'],
  ['cancellationCutoffHours', 'Late cancellation within (hours)'],
  ['maxActiveBookingsPerCustomer', 'Upcoming bookings per customer'],
  ['rescheduleCutoffHours', 'Reschedule cut-off (hours)'],
  ['maxReschedulesPerBooking', 'Reschedules per booking'],
]

async function settingsScreen(page: Page): Promise<SettingsScreen> {
  return data<SettingsScreen>(await page.request.get('/api/settings'))
}

/**
 * Open Settings and wait until the active branch's sections have loaded. The
 * screen renders fourteen time pickers after its API read, which a dev server
 * compiling on first visit can take a while to show.
 */
async function openSettings(page: Page, screen: SettingsScreen): Promise<void> {
  await page.goto('/settings')
  await expect(
    page.getByRole('heading', { name: `Business hours at ${screen.branch.branchName}` }),
  ).toBeVisible({ timeout: 30_000 })
}

describeAs('developer', 'Branch settings', () => {
  test("shows the active branch's settings as the API returns them", async ({ page }) => {
    const branch = await activeBranch(page.request)
    const screen = await settingsScreen(page)
    expect(screen.branch.branchId).toBe(branch.id)
    expect(screen.branch.revision).toBeGreaterThan(0)

    await openSettings(page, screen)

    await expect(
      page.getByRole('heading', { name: `Booking rules at ${screen.branch.branchName}` }),
    ).toBeVisible()
    await expect(page.getByTestId('settings-revision')).toHaveText(
      new RegExp(`^Revision ${screen.branch.revision}, (saved|set up) `),
    )
    const rules = screen.branch.bookingRules
    expect(rules, `${screen.branch.branchName} has unreadable booking rules`).not.toBeNull()
    for (const [key, label] of RULE_LABELS) {
      await expect(page.getByLabel(label)).toHaveValue(String(rules?.[key]))
    }
    const hours = screen.branch.businessHours
    for (const [day, label] of [
      ['mon', 'Monday'],
      ['sun', 'Sunday'],
    ] as const) {
      const checkbox = page.getByRole('checkbox', { name: `${label} closed` })
      await expect(checkbox).toHaveAttribute('aria-checked', String(hours?.[day]?.closed ?? false))
    }
    await expect(page.getByText(/^Revision \d+$/)).toHaveCount(screen.history.length)
  })

  test("shows another branch's own settings after a switch", async ({ page }) => {
    const { active, branches } = await myBranches(page.request)
    const other = branches.find((b) => b.id !== active?.id)
    test.skip(!active || !other, 'the Developer works in only one branch')
    if (!active || !other) {
      return
    }

    try {
      await switchBranch(page.request, other.id)
      const screen = await settingsScreen(page)
      expect(screen.branch.branchId).toBe(other.id)

      await openSettings(page, screen)
      await expect(page.getByTestId('settings-revision')).toHaveText(
        new RegExp(`^Revision ${screen.branch.revision}, `),
      )
    } finally {
      await switchBranch(page.request, active.id)
    }
  })

  test('the API refuses stale, cross-branch and invalid saves, writing nothing', async ({
    page,
  }) => {
    const before = await settingsScreen(page)
    const hours = before.branch.businessHours
    const rules = before.branch.bookingRules
    test.skip(!hours || !rules, 'the active branch has unreadable settings')
    if (!hours || !rules) {
      return
    }

    // Edited from a revision that isn't the current one.
    const stale = await page.request.put('/api/settings', {
      data: {
        section: 'bookingRules',
        branchId: before.branch.branchId,
        expectedRevision: before.branch.revision + 1,
        value: rules,
      },
    })
    expect(stale.status()).toBe(409)
    expect(await errorCode(stale)).toBe('SETTINGS_CHANGED')

    // Rendered for another branch.
    const elsewhere = await page.request.put('/api/settings', {
      data: {
        section: 'businessHours',
        branchId: 'e2e-no-such-branch',
        expectedRevision: before.branch.revision,
        value: hours,
      },
    })
    expect(elsewhere.status()).toBe(409)
    expect(await errorCode(elsewhere)).toBe('BRANCH_CONTEXT_CHANGED')

    // A day that closes before it opens.
    const invalid = await page.request.put('/api/settings', {
      data: {
        section: 'businessHours',
        branchId: before.branch.branchId,
        expectedRevision: before.branch.revision,
        value: { ...hours, mon: { open: '21:00', close: '10:00', closed: false } },
      },
    })
    expect(invalid.status()).toBe(400)

    const after = await settingsScreen(page)
    expect(after.branch.revision).toBe(before.branch.revision)
    expect(after.history.map((h) => h.revision)).toEqual(before.history.map((h) => h.revision))
  })
})

const OTHER_ROLES: readonly AdminRole[] = ['owner', 'manager', 'receptionist']

for (const role of OTHER_ROLES) {
  describeAs(role, 'Branch settings', () => {
    test('are closed to anyone but the Developer', async ({ page }) => {
      const response = await page.goto('/settings', { waitUntil: 'domcontentloaded' })
      // The middleware answers 403; an impersonating dev server skips it, and
      // the screen then shows the API's refusal.
      if (response?.status() !== 403) {
        await expect(page.getByText(/^You do not have permission/)).toBeVisible({
          timeout: 30_000,
        })
      }

      const api = await page.request.get('/api/settings')
      expect(api.status()).toBe(403)
      const write = await page.request.put('/api/settings', {
        data: { section: 'invoicing', value: { live: false } },
      })
      expect(write.status()).toBe(403)
    })
  })
}
