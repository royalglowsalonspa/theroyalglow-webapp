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
      for (const branch of branches) {
        await expect(
          menu.getByRole('menuitem').filter({ has: page.getByText(branch.name, { exact: true }) }),
        ).toHaveCount(1)
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
        .filter({ has: page.getByText(target.name, { exact: true }) })
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

      const response = await page.request.put('/api/me/branch', {
        data: { branchId: 'e2e-no-such-branch' },
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
  })
}
