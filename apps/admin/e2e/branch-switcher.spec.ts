import { expect, type Page, test } from '@playwright/test'
import { activeBranch, data, errorCode, myBranches, switchBranch } from './fixtures/admin-api'
import { type AdminRole, describeAs, IMPERSONATED_ROLE } from './fixtures/auth'

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

describeAs('owner', 'Two-branch lead transfer', () => {
  const sourceId = process.env.ADMIN_E2E_TRANSFER_SOURCE_BRANCH_ID
  const destinationId = process.env.ADMIN_E2E_TRANSFER_DESTINATION_BRANCH_ID
  const hiddenId = process.env.ADMIN_E2E_INACCESSIBLE_BRANCH_ID
  const leadId = process.env.ADMIN_E2E_TRANSFER_LEAD_ID
  const hiddenLeadId = process.env.ADMIN_E2E_INACCESSIBLE_LEAD_ID

  test('moves a lead, changes its visibility, and keeps a third branch private', async ({
    page,
  }) => {
    test.skip(
      !!IMPERSONATED_ROLE || !(sourceId && destinationId && hiddenId && leadId && hiddenLeadId),
      'provide a stored Owner session and disposable lead fixtures in three branches',
    )
    if (!(sourceId && destinationId && hiddenId && leadId && hiddenLeadId)) return

    const { branches } = await myBranches(page.request)
    const accessibleIds = branches.map((branch) => branch.id)
    expect(new Set([sourceId, destinationId, hiddenId]).size).toBe(3)
    expect(leadId).not.toBe(hiddenLeadId)
    expect(accessibleIds).toEqual(expect.arrayContaining([sourceId, destinationId]))
    expect(accessibleIds).not.toContain(hiddenId)

    const leadPath = `/api/leads/${encodeURIComponent(leadId)}`
    const hiddenLeadPath = `/api/leads/${encodeURIComponent(hiddenLeadId)}`
    await switchBranch(page.request, sourceId)
    const initial = await page.request.get(leadPath)
    expect(initial.status()).toBe(200)
    const { lead } = await data<{ lead: { branchId: string; status: string } }>(initial)
    expect(lead.branchId).toBe(sourceId)

    await switchBranch(page.request, destinationId)
    expect((await page.request.get(leadPath)).status()).toBe(404)
    await switchBranch(page.request, sourceId)

    const move = await page.request.post(`${leadPath}/move`, {
      data: { branchId: sourceId, toBranchId: destinationId },
    })
    expect(move.status(), await move.text()).toBe(200)
    try {
      expect((await page.request.get(leadPath)).status()).toBe(404)
      expect(
        (
          await page.request.patch(leadPath, { data: { branchId: sourceId, status: 'contacted' } })
        ).status(),
      ).toBe(404)

      await switchBranch(page.request, destinationId)
      const received = await page.request.get(leadPath)
      expect(received.status()).toBe(200)
      expect(await received.json()).toMatchObject({
        data: { lead: { id: leadId, branchId: destinationId, status: lead.status } },
      })
      expect((await page.request.get(hiddenLeadPath)).status()).toBe(404)
      const denied = await page.request.put('/api/me/branch', { data: { branchId: hiddenId } })
      expect(denied.status()).toBe(404)
      expect(await errorCode(denied)).toBe('NOT_FOUND')
      expect((await activeBranch(page.request)).id).toBe(destinationId)
      expect((await page.request.get(hiddenLeadPath)).status()).toBe(404)
    } finally {
      await switchBranch(page.request, destinationId)
      const restored = await page.request.post(`${leadPath}/move`, {
        data: { branchId: destinationId, toBranchId: sourceId },
      })
      expect(restored.status(), await restored.text()).toBe(200)
    }
  })
})
