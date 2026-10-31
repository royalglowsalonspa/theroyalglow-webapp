import { expect, type Locator, test } from '@playwright/test'
import {
  type BranchRoles,
  branchRoles,
  errorCode,
  escapeRegExp,
  myBranches,
  switchBranch,
} from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'

/************************************************************
 * Users & Roles E2E (multi-branch R1.4, R1.5, R1.11, R2.4)
 *
 * As the branch's Owner and as the Developer:
 *   - the page shows the active branch's Owner, Manager and Receptionist as
 *     GET /api/users/branch-roles reports them, with Change only where this
 *     role may change the holder (only the Developer changes the Owner);
 *   - person search waits for three characters, then shows matches that
 *     can't be picked with the reason;
 *   - a change sent for the branch a page was rendered for is refused with
 *     409 BRANCH_CONTEXT_CHANGED once the person has switched branch.
 *
 * Read-only: searches and the refused request change nothing. The write
 * journeys (choose and remove a Manager) are in people-writes.spec.ts and
 * run only when a disposable account is configured.
 ************************************************************/

type Holder = 'owner' | 'manager' | 'receptionist'

const HOLDERS: readonly Holder[] = ['owner', 'manager', 'receptionist']

const LABEL: Record<Holder, string> = {
  owner: 'Owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
}

const CAN: Record<Holder, keyof BranchRoles['can']> = {
  owner: 'setOwner',
  manager: 'setManager',
  receptionist: 'setReceptionist',
}

const LOCKED: Record<Holder, string> = {
  owner: 'Only the Developer can change the Owner.',
  manager: "Only the branch's Owner or the Developer can change the Manager.",
  receptionist: "Only the branch's Owner or the Developer can change the Receptionist.",
}

/** The Change / Choose toggle of a card: the only control with aria-expanded. */
function changeToggle(card: Locator): Locator {
  return card.locator('button[aria-expanded]')
}

const ROLES: readonly AdminRole[] = ['owner', 'developer']

for (const role of ROLES) {
  describeAs(role, 'Users & Roles', () => {
    test('shows who runs the active branch and what this role may change', async ({ page }) => {
      const roles = await branchRoles(page.request)
      expect(roles.owner, 'every branch has an Owner').not.toBeNull()
      expect(roles.can).toEqual({
        setOwner: role === 'developer',
        setManager: true,
        setReceptionist: true,
      })

      await page.goto('/users')
      await expect(page.getByRole('heading', { level: 1, name: 'Users & Roles' })).toBeVisible()
      await expect(
        page.getByRole('main').getByText(roles.branch.name, { exact: true }),
      ).toBeVisible()

      for (const holder of HOLDERS) {
        const card = page.getByRole('region', { name: LABEL[holder] })
        const current = roles[holder]
        await expect(card).toContainText(current ? current.email : `No ${LABEL[holder]} yet.`)

        if (roles.can[CAN[holder]]) {
          await expect(changeToggle(card)).toHaveText(
            current ? 'Change' : `Choose ${LABEL[holder]}`,
          )
          await expect(card.getByRole('button', { name: 'Remove' })).toHaveCount(
            current && holder !== 'owner' ? 1 : 0,
          )
        } else {
          await expect(changeToggle(card)).toHaveCount(0)
          await expect(card).toContainText(LOCKED[holder])
        }
      }
    })

    test('person search waits for three characters and says why a match cannot be picked', async ({
      page,
    }) => {
      const roles = await branchRoles(page.request)
      const owner = roles.owner
      expect(owner, 'every branch has an Owner').not.toBeNull()
      if (!owner) {
        return
      }
      // The Owner looks themselves up for Manager; the Developer looks the
      // Owner up for Owner. Both answers are fixed by the rules, not the data.
      const holder: Holder = role === 'developer' ? 'owner' : 'manager'
      const reason =
        role === 'developer' ? 'Already the Owner' : 'This is you. Nobody changes their own role.'

      await page.goto('/users')
      const card = page.getByRole('region', { name: LABEL[holder] })
      await changeToggle(card).click()
      await expect(changeToggle(card)).toHaveAttribute('aria-expanded', 'true')
      await expect(changeToggle(card)).toHaveText('Cancel')

      const search = card.getByLabel(`Find the new ${LABEL[holder]}`)
      await expect(search).toBeVisible()

      let lookups = 0
      page.on('request', (request) => {
        if (request.url().includes('/api/users?search=')) {
          lookups += 1
        }
      })

      await search.fill(owner.email.slice(0, 2))
      // Longer than the 300 ms debounce: a lookup would have been sent by now.
      await page.waitForTimeout(800)
      expect(lookups, 'two characters must not search').toBe(0)
      await expect(card.getByText(/Type at least 3 characters/)).toBeVisible()

      const lookup = page.waitForResponse(
        (response) => response.url().includes('/api/users?search=') && response.ok(),
      )
      await search.fill(owner.email)
      await lookup

      const match = card.getByRole('button', { name: new RegExp(escapeRegExp(owner.email)) })
      await expect(match).toBeDisabled()
      await expect(match).toContainText(reason)

      await changeToggle(card).click()
      await expect(search).toHaveCount(0)
      await expect(changeToggle(card)).toHaveAttribute('aria-expanded', 'false')
    })

    test('a change for the branch a page was rendered for is refused after a switch (R2.4)', async ({
      page,
    }) => {
      const { active, branches } = await myBranches(page.request)
      const other = branches.find((b) => b.id !== active?.id)
      test.skip(!(active && other), 'this account works in only one branch')
      if (!(active && other)) {
        return
      }

      await switchBranch(page.request, other.id)

      // What a tab still showing the first branch would send. The user id is
      // made up, so even a broken guard could not change anyone's role.
      const response = await page.request.post('/api/users', {
        data: { kind: 'remove', branchId: active.id, userId: 'e2e-nobody' },
      })
      expect(response.status()).toBe(409)
      expect(await errorCode(response)).toBe('BRANCH_CONTEXT_CHANGED')
    })
  })
}
