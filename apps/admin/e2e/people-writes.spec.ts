import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  branchRoles,
  data,
  escapeRegExp,
  type Person,
  type StaffRow,
  staffPage,
  switchBranch,
} from './fixtures/admin-api'
import { type AdminRole, canActAs, describeAs } from './fixtures/auth'

/************************************************************
 * People write journeys E2E (multi-branch R1.4, R1.5, R1.6, R1.11)
 *
 * End-to-end changes made through the screens, each undone at the end:
 *   1. Staff: add a person as a Therapist, edit their specialization, remove
 *      them (they return to Customer).
 *   2. Users & Roles: choose the person as the branch's Manager, then remove
 *      them as Manager.
 *
 * OPT-IN, because these write to the target database. They run only when
 *   ADMIN_E2E_WRITE_PERSON_EMAIL names a disposable account that holds no
 *   role (a Customer who has signed in once), and the suite can act as the
 *   branch's Owner or the Developer. ADMIN_E2E_WRITE_BRANCH_ID optionally
 *   picks the branch; the Manager journey needs a branch without a Manager
 *   and skips otherwise.
 *
 * Each journey removes the person again in a `finally`, through the same
 * APIs, if a step fails part-way. What stays behind is what the product keeps
 * on purpose: audit entries, and the person's inactive staff profile as
 * history (R1.5).
 ************************************************************/

const PERSON_EMAIL = process.env.ADMIN_E2E_WRITE_PERSON_EMAIL?.trim().toLowerCase() ?? ''
const WRITE_BRANCH_ID = process.env.ADMIN_E2E_WRITE_BRANCH_ID?.trim() ?? ''

/** The role the journeys act as: the Owner when available, else the Developer. */
const WRITER: AdminRole = canActAs('owner') ? 'owner' : 'developer'

// One disposable person, so the journeys never run at the same time.
test.describe.configure({ mode: 'serial' })

/** The person's display name, as the screens show it. */
function labelOf(person: Person): string {
  return person.name || person.email
}

/** The Change / Choose toggle of a Users & Roles card. */
function changeToggle(card: Locator): Locator {
  return card.locator('button[aria-expanded]')
}

/** Move to the configured branch, if one was given. */
async function enterWriteBranch(page: Page): Promise<void> {
  if (WRITE_BRANCH_ID) {
    await switchBranch(page.request, WRITE_BRANCH_ID)
  }
}

function waitForApi(page: Page, path: string, method: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path && response.request().method() === method,
  )
}

describeAs(WRITER, 'People write journeys', () => {
  test.skip(!PERSON_EMAIL, 'set ADMIN_E2E_WRITE_PERSON_EMAIL to a disposable Customer account')

  test('add a Therapist, edit them, and remove them again', async ({ page }) => {
    await enterWriteBranch(page)
    const { branch, staff } = await staffPage(page.request)
    expect(
      staff.some((member) => member.email === PERSON_EMAIL),
      `${PERSON_EMAIL} must not already be on the staff at ${branch.name}`,
    ).toBe(false)

    try {
      await page.goto('/staff')
      await page.getByRole('button', { name: 'Add staff' }).click()
      const dialog = page.getByRole('dialog', { name: `Add staff at ${branch.name}` })

      const lookup = waitForApi(page, '/api/staff/candidates', 'GET')
      await dialog.getByLabel('Find a person').fill(PERSON_EMAIL)
      const found = await data<{ people: (Person & { available: boolean })[] }>(await lookup)
      const person = found.people.find((p) => p.email.toLowerCase() === PERSON_EMAIL)
      expect(person, `${PERSON_EMAIL} has no account`).toBeDefined()
      expect(person?.available, `${PERSON_EMAIL} can't be added here`).toBe(true)
      if (!person) {
        return
      }

      await dialog.getByRole('button', { name: new RegExp(escapeRegExp(person.email)) }).click()
      await dialog.getByRole('combobox', { name: 'Title' }).click()
      await page.getByRole('option', { name: 'Therapist' }).click()
      await dialog.getByLabel('Specialization (optional)').fill('E2E journey')

      const added = waitForApi(page, '/api/staff', 'POST')
      await dialog.getByRole('button', { name: 'Add staff' }).click()
      expect((await added).ok(), 'Add staff was refused').toBe(true)
      await expect(dialog).toHaveCount(0)

      const table = page.getByRole('table', { name: `Staff at ${branch.name}` })
      // Clickable rows carry role="button", so match the element, not the role.
      const row = table.locator('tbody tr').filter({ hasText: person.email })
      await expect(row).toContainText('Therapist')
      const member = await staffMember(page)
      expect(member.designation).toBe('therapist')
      expect(member.specialization).toBe('E2E journey')

      // Edit: change the specialization.
      await row.getByRole('button', { name: 'Row actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit' }).click()
      const edit = page.getByRole('dialog', { name: `Edit ${member.name}` })
      const specialization = edit.getByLabel('Specialization', { exact: true })
      await expect(specialization).toHaveValue('E2E journey')
      await specialization.fill('E2E journey, edited')
      const saved = waitForApi(page, `/api/staff/${member.id}/services`, 'PUT')
      await edit.getByRole('button', { name: 'Save' }).click()
      expect((await saved).ok(), 'saving the staff member was refused').toBe(true)
      await expect(edit).toHaveCount(0)

      const edited = await staffMember(page)
      expect(edited.designation).toBe('therapist')
      expect(edited.specialization).toBe('E2E journey, edited')

      // Remove: back to Customer.
      await row.getByRole('button', { name: 'Row actions' }).click()
      await page.getByRole('menuitem', { name: 'Remove' }).click()
      const confirm = page.getByRole('alertdialog', {
        name: `Remove ${member.name} from ${branch.name}?`,
      })
      const removed = waitForApi(page, `/api/staff/${member.id}/remove`, 'POST')
      await confirm.getByRole('button', { name: 'Remove' }).click()
      expect((await removed).ok(), 'Remove was refused').toBe(true)
      await expect(confirm).toHaveCount(0)
      await expect(row).toHaveCount(0)
    } finally {
      const leftover = (await staffPage(page.request)).staff.find((m) => m.email === PERSON_EMAIL)
      if (leftover) {
        await page.request.post(`/api/staff/${leftover.id}/remove`, {
          data: { branchId: branch.id },
        })
      }
    }
  })

  test('choose a Manager and remove them again', async ({ page }) => {
    await enterWriteBranch(page)
    const roles = await branchRoles(page.request)
    test.skip(
      roles.manager !== null,
      `${roles.branch.name} already has a Manager; set ADMIN_E2E_WRITE_BRANCH_ID to a branch without one`,
    )
    const branch = roles.branch

    try {
      await page.goto('/users')
      const card = page.getByRole('region', { name: 'Manager' })
      await expect(card).toContainText('No Manager yet.')
      await changeToggle(card).click()

      const lookup = waitForApi(page, '/api/users', 'GET')
      await card.getByLabel('Find the new Manager').fill(PERSON_EMAIL)
      const found = await data<{ users: (Person & { actions: string[] })[] }>(await lookup)
      const person = found.users.find((p) => p.email.toLowerCase() === PERSON_EMAIL)
      expect(person, `${PERSON_EMAIL} has no account`).toBeDefined()
      expect(person?.actions, `${PERSON_EMAIL} can't be made Manager here`).toContain('set_manager')
      if (!person) {
        return
      }
      const name = labelOf(person)

      await card.getByRole('button', { name: new RegExp(escapeRegExp(person.email)) }).click()
      const confirm = page.getByRole('alertdialog', {
        name: `Make ${name} the Manager of ${branch.name}?`,
      })
      await expect(confirm).toContainText('Admin pages')
      const changed = waitForApi(page, '/api/users', 'POST')
      await confirm.getByRole('button', { name: 'Make Manager' }).click()
      expect((await changed).ok(), 'making them Manager was refused').toBe(true)
      await expect(confirm).toHaveCount(0)
      await expect(card).toContainText(person.email)
      expect((await branchRoles(page.request)).manager?.email.toLowerCase()).toBe(PERSON_EMAIL)

      await card.getByRole('button', { name: 'Remove' }).click()
      const remove = page.getByRole('alertdialog', { name: `Remove ${name} as Manager?` })
      const removed = waitForApi(page, '/api/users', 'POST')
      await remove.getByRole('button', { name: 'Remove' }).click()
      expect((await removed).ok(), 'removing them as Manager was refused').toBe(true)
      await expect(remove).toHaveCount(0)
      await expect(card).toContainText('No Manager yet.')
    } finally {
      const now = await branchRoles(page.request)
      if (now.manager && now.manager.email.toLowerCase() === PERSON_EMAIL) {
        await page.request.post('/api/users', {
          data: { kind: 'remove', branchId: branch.id, userId: now.manager.id },
        })
      }
    }
  })
})

/** The disposable person's row on the active branch's staff. */
async function staffMember(page: Page): Promise<StaffRow> {
  const member = (await staffPage(page.request)).staff.find(
    (m) => m.email.toLowerCase() === PERSON_EMAIL,
  )
  expect(member, `${PERSON_EMAIL} is not on the staff`).toBeDefined()
  return member as StaffRow
}
