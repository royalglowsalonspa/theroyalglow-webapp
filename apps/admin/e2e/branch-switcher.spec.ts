import { expect, type Page, test } from '@playwright/test'
import { activeBranch, errorCode, myBranches, switchBranch } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'

/************************************************************
 * Branch switcher E2E (multi-branch R2.1, R2.4)
 *
 * For each role the suite can act as:
 *   - the sidebar switcher names the active branch and lists exactly the
 *     branches GET /api/me/branch says the person can work in;
 *   - choosing another branch stores it in the HttpOnly `rgss_admin_branch`
 *     cookie and reloads the whole page into that branch;
 *   - a branch the person can't access is refused (404) and changes nothing.
 *
 * Nothing here writes data: switching only sets a cookie in the test's own
 * browser context, which Playwright discards after each test.
 ************************************************************/

const ACTIVE_BRANCH_COOKIE = 'rgss_admin_branch'

const ROLES: readonly AdminRole[] = ['owner', 'developer', 'manager', 'receptionist']

function switcherName(branchName: string): string {
  return `Active branch: ${branchName}. Switch branch.`
}

function switcher(page: Page) {
  return page.getByRole('button', { name: /^Active branch: .+\. Switch branch\.$/ })
}

for (const role of ROLES) {
  describeAs(role, 'Branch switcher', () => {
    test('names the active branch and lists only branches the person can work in', async ({
      page,
    }) => {
      const { active, branches } = await myBranches(page.request)
      expect(active, 'the signed-in account works in no branch').not.toBeNull()
      if (!active) {
        return
      }
      expect(branches.map((b) => b.id)).toContain(active.id)

      await page.goto('/')
      await expect(switcher(page)).toHaveAccessibleName(switcherName(active.name))

      await switcher(page).click()
      const menu = page.getByRole('menu')
      await expect(
        menu.getByText(branches.length > 1 ? 'Switch branch' : 'Your branch'),
      ).toBeVisible()
      await expect(menu.getByRole('menuitem')).toHaveCount(branches.length)
      for (const [index, branch] of branches.entries()) {
        await expect(
          menu.getByRole('menuitem').nth(index).getByText(branch.name, { exact: true }),
        ).toBeVisible()
        await expect(menu.getByRole('menuitem').nth(index)).toContainText(branch.code)
      }
      const marked = menu
        .getByRole('menuitem')
        .filter({ has: page.locator('[aria-label="Active"]') })
      await expect(marked).toHaveCount(1)
      await expect(marked.getByText(active.name, { exact: true })).toBeVisible()
    })

    test('switching stores the choice and reloads the portal into that branch', async ({
      page,
      context,
    }) => {
      const { active, branches } = await myBranches(page.request)
      const target = branches.find((b) => b.id !== active?.id)
      test.skip(!target, 'this account works in only one branch')
      if (!target) {
        return
      }

      await page.goto('/')
      await expect(switcher(page)).toHaveAccessibleName(switcherName(active?.name ?? ''))
      await switcher(page).click()

      // The switcher reloads the whole page so nothing from the old branch survives.
      const reloaded = page.waitForEvent('framenavigated', {
        predicate: (frame) => frame === page.mainFrame(),
      })
      await page
        .getByRole('menuitem')
        .nth(branches.findIndex((branch) => branch.id === target.id))
        .click()
      await reloaded

      await expect(switcher(page)).toHaveAccessibleName(switcherName(target.name))

      const cookie = (await context.cookies()).find((c) => c.name === ACTIVE_BRANCH_COOKIE)
      expect(cookie?.value).toBe(target.id)
      expect(cookie?.httpOnly, 'the branch cookie is set by the server only').toBe(true)
      expect((await activeBranch(page.request)).id).toBe(target.id)
    })

    test('a branch the person cannot work in is refused and changes nothing', async ({ page }) => {
      const before = await activeBranch(page.request)
      const hiddenBranch = process.env.ADMIN_E2E_INACCESSIBLE_BRANCH_ID
      const { branches } = await myBranches(page.request)
      const target =
        hiddenBranch && !branches.some((branch) => branch.id === hiddenBranch)
          ? hiddenBranch
          : 'e2e-no-such-branch'

      const response = await page.request.put('/api/me/branch', {
        data: { branchId: target },
      })
      expect(response.status()).toBe(404)
      expect(await errorCode(response)).toBe('NOT_FOUND')

      expect((await activeBranch(page.request)).id).toBe(before.id)
    })

    test('switching back restores the first branch', async ({ page }) => {
      const { active, branches } = await myBranches(page.request)
      const other = branches.find((b) => b.id !== active?.id)
      test.skip(!(active && other), 'this account works in only one branch')
      if (!(active && other)) {
        return
      }

      expect((await switchBranch(page.request, other.id)).id).toBe(other.id)
      expect((await switchBranch(page.request, active.id)).id).toBe(active.id)

      await page.goto('/')
      await expect(switcher(page)).toHaveAccessibleName(switcherName(active.name))
    })

    test('rejects a lead action from a tab rendered before a branch switch', async ({
      page,
      context,
    }) => {
      const { active, branches } = await myBranches(page.request)
      const other = branches.find((branch) => branch.id !== active?.id)
      test.skip(!(active && other), 'this account works in only one branch')
      if (!(active && other)) return

      await page.goto('/leads')
      await expect(switcher(page)).toHaveAccessibleName(switcherName(active.name))

      const secondTab = await context.newPage()
      await secondTab.goto('/leads')
      await expect(switcher(secondTab)).toHaveAccessibleName(switcherName(active.name))
      expect((await switchBranch(secondTab.request, other.id)).id).toBe(other.id)
      await secondTab.reload()
      await expect(switcher(secondTab)).toHaveAccessibleName(switcherName(other.name))
      await expect(switcher(page)).toHaveAccessibleName(switcherName(active.name))

      const response = await page.request.post('/api/leads/e2e-no-such-lead/move', {
        data: { branchId: active.id, toBranchId: other.id },
      })
      expect(response.status()).toBe(409)
      expect(await errorCode(response)).toBe('BRANCH_CONTEXT_CHANGED')
    })

    test('does not paint the previous branch when its pipeline response arrives late', async ({
      page,
    }) => {
      const { active, branches } = await myBranches(page.request)
      const other = branches.find((branch) => branch.id !== active?.id)
      test.skip(!(active && other), 'this account works in only one branch')
      if (!(active && other)) return

      const firstRead = Promise.withResolvers<void>()
      const releaseFirstRead = Promise.withResolvers<void>()
      const firstResponseFinished = Promise.withResolvers<void>()
      const previousName = 'Lead from the previous branch'
      const currentName = 'Lead from the selected branch'
      let requests = 0
      await page.route('**/api/leads', async (route) => {
        const previous = requests++ === 0
        if (previous) {
          firstRead.resolve()
          await releaseFirstRead.promise
        }
        try {
          await route.fulfill({
            json: {
              success: true,
              data: {
                branchId: previous ? active.id : other.id,
                leads: [
                  {
                    id: previous ? 'lead_previous' : 'lead_current',
                    name: previous ? previousName : currentName,
                    phone: '+910000000000',
                    status: 'new',
                    source: 'manual',
                    daysSinceCapture: 0,
                    isStale: false,
                  },
                ],
              },
            },
          })
        } catch (error) {
          // Reload can cancel the first document's pending network request.
          if (!previous) throw error
        } finally {
          if (previous) firstResponseFinished.resolve()
        }
      })

      try {
        await page.goto('/leads')
        await firstRead.promise
        await expect(switcher(page)).toHaveAccessibleName(switcherName(active.name))
        await switcher(page).press('Enter')
        await page
          .getByRole('menuitem')
          .nth(branches.findIndex((branch) => branch.id === other.id))
          .press('Enter')
        await expect(switcher(page)).toHaveAccessibleName(switcherName(other.name))
        await expect(page.getByText(currentName, { exact: true })).toBeVisible()
      } finally {
        releaseFirstRead.resolve()
      }
      await firstResponseFinished.promise
      await expect(page.getByText(previousName, { exact: true })).toHaveCount(0)
      await expect(page.getByText(currentName, { exact: true })).toBeVisible()
    })
  })
}
