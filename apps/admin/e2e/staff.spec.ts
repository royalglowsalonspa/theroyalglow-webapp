import { expect, test } from '@playwright/test'
import { escapeRegExp, type StaffRow, staffPage } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'

/************************************************************
 * Staff page E2E (multi-branch R1.5, R1.6, R1.11)
 *
 * As the branch's Manager, its Owner and the Developer:
 *   - the page lists the active branch's staff as GET /api/staff/all reports
 *     them, and each row offers exactly the actions this role has: a Manager
 *     edits and removes Stylists and Therapists only; the Owner and the
 *     Developer also edit the Manager and Receptionist, who are removed in
 *     Users & Roles;
 *   - Add staff searches from three characters and won't save without a
 *     person.
 *
 * Read-only: dialogs are cancelled and searches change nothing. Adding,
 * editing and removing a real person is in people-writes.spec.ts.
 ************************************************************/

const ROLES: readonly AdminRole[] = ['manager', 'owner', 'developer']

/** The actions a role has on a staff row, by the R1.5 rules. */
function expectedActions(role: AdminRole, member: StaffRow): { edit: boolean; remove: boolean } {
  const performsServices = member.roleWitness === 'staff'
  return {
    edit: role === 'manager' ? performsServices : true,
    remove: performsServices,
  }
}

for (const role of ROLES) {
  describeAs(role, 'Staff', () => {
    test('lists the branch staff with the actions this role has', async ({ page }) => {
      const { branch, staff } = await staffPage(page.request)
      for (const member of staff) {
        const expected = expectedActions(role, member)
        expect({ edit: member.canEdit, remove: member.canRemove }, member.email).toEqual(expected)
      }

      await page.goto('/staff')
      await expect(
        page.getByRole('heading', { level: 1, name: `Staff · ${branch.name}` }),
      ).toBeVisible()

      if (staff.length === 0) {
        await expect(page.getByText('No staff yet')).toBeVisible()
        return
      }

      const table = page.getByRole('table', { name: `Staff at ${branch.name}` })
      await expect(table).toBeVisible()
      const searchBox = page.getByRole('searchbox', { name: 'Search staff' })

      for (const member of staff) {
        // Filtering to the member keeps them on the first page of the table.
        await searchBox.fill(member.email)
        // Clickable rows carry role="button", so match the element, not the role.
        const row = table.locator('tbody tr').filter({ hasText: member.email })
        await expect(row, member.email).toHaveCount(1)
        const actions = row.getByRole('button', { name: 'Row actions' })
        if (!(member.canEdit || member.canRemove)) {
          await expect(actions).toHaveCount(0)
          continue
        }
        await actions.click()
        const menu = page.getByRole('menu')
        await expect(menu.getByRole('menuitem', { name: 'Edit' })).toHaveCount(
          member.canEdit ? 1 : 0,
        )
        await expect(menu.getByRole('menuitem', { name: 'Remove' })).toHaveCount(
          member.canRemove ? 1 : 0,
        )
        await page.keyboard.press('Escape')
        await expect(menu).toHaveCount(0)
      }
    })

    test('Add staff searches from three characters and needs a person to save', async ({
      page,
    }) => {
      const { branch, staff } = await staffPage(page.request)

      await page.goto('/staff')
      await page.getByRole('button', { name: 'Add staff' }).click()
      const dialog = page.getByRole('dialog', { name: `Add staff at ${branch.name}` })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('combobox', { name: 'Title' })).toHaveText('Stylist')

      let lookups = 0
      page.on('request', (request) => {
        if (request.url().includes('/api/staff/candidates')) {
          lookups += 1
        }
      })

      // Saving before anyone is chosen is stopped on the page.
      await dialog.getByRole('button', { name: 'Add staff' }).click()
      await expect(dialog.getByRole('alert')).toHaveText('Find and choose the person first.')

      const search = dialog.getByLabel('Find a person')
      await search.fill('ab')
      // Longer than the 300 ms debounce: a lookup would have been sent by now.
      await page.waitForTimeout(800)
      expect(lookups, 'two characters must not search').toBe(0)

      // Someone already on this branch's staff is found but can't be added.
      const member = staff[0]
      const term = member ? member.email : 'e2e-nobody-zzq'
      const lookup = page.waitForResponse(
        (response) => response.url().includes('/api/staff/candidates') && response.ok(),
      )
      await search.fill(term)
      await lookup

      if (member) {
        const match = dialog.getByRole('button', { name: new RegExp(escapeRegExp(member.email)) })
        await expect(match).toBeDisabled()
      } else {
        await expect(dialog.getByText(/No matching accounts/)).toBeVisible()
      }

      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toHaveCount(0)
    })
  })
}
