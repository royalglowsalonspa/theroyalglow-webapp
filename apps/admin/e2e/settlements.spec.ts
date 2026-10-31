import { expect, type Page, test } from '@playwright/test'
import { data, myBranches } from './fixtures/admin-api'
import { type AdminRole, describeAs } from './fixtures/auth'

/************************************************************
 * Settlements E2E (multi-branch R10, MS-24, MS-25)
 *
 * As the Developer:
 *   - /settlements lists the statements and the open months exactly as
 *     GET /api/settlements returns them, for every pair of branches;
 *   - a statement opens with its entries, the Reverse action and a CSV
 *     download whose file is the accountant's attachment;
 *   - the API refuses a future payment date, a correction without a reason,
 *     and a statement or entry that doesn't exist, before writing anything;
 *   - Reports shows the branch's memberships and gems across branches, with
 *     the link to the statements.
 * As an Owner: the statements of pairs with a branch they own, no
 * corrections. For a Manager and a Receptionist the page is closed, the API
 * answers 404 and Reports shows minutes and gems without the money.
 *
 * Nothing here writes data: marking paid and reversing can't be undone, so
 * they are covered by the route, component and live suites only.
 ************************************************************/

type BranchRef = { id: string; name: string }

type StatementView = {
  id: string
  month: string
  branchA: BranchRef
  branchB: BranchRef
  net: { payingBranch: BranchRef | null; receivingBranch: BranchRef | null; amountPaise: number }
  paid: unknown
  canMarkPaid: boolean
}

type OpenMonthView = { month: string; branchA: BranchRef; branchB: BranchRef }

type ListView = { statements: StatementView[]; open: OpenMonthView[]; scope: 'all' | 'owner' }

type EntryView = { id: string; kind: string }

type DetailView = { statement: StatementView; entries: EntryView[]; canReverse: boolean }

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTHS[Number(m) - 1]} ${year}`
}

async function settlements(page: Page): Promise<ListView> {
  return data<ListView>(await page.request.get('/api/settlements'))
}

/** Open the Settlements screen and wait until it has loaded. */
async function openSettlements(page: Page, list: ListView): Promise<void> {
  await page.goto('/settlements')
  await expect(page.getByRole('heading', { level: 1, name: 'Settlements' })).toBeVisible()
  if (list.statements.length === 0) {
    await expect(page.getByText('No statements yet')).toBeVisible({ timeout: 30_000 })
  } else {
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 })
  }
}

/** The statement's button in the list: its month, then the two branches. */
function statementButton(page: Page, statement: StatementView) {
  return page.getByRole('button', {
    name: `${monthLabel(statement.month)}, ${statement.branchA.name} and ${statement.branchB.name}`,
  })
}

describeAs('developer', 'Settlements', () => {
  test('lists every pair’s statements and open months as the API returns them', async ({
    page,
  }) => {
    const list = await settlements(page)
    expect(list.scope).toBe('all')

    await openSettlements(page, list)

    // The table shows its default page of rows.
    const shown = list.statements.slice(0, 25)
    for (const statement of shown) {
      await expect(statementButton(page, statement)).toBeVisible()
    }
    const open = page.getByRole('region', { name: 'This month so far' })
    if (list.open.length === 0) {
      await expect(open).toHaveCount(0)
    } else {
      await expect(open.getByRole('listitem')).toHaveCount(list.open.length)
    }
  })

  test('opens a statement with its entries and the CSV for the accountant', async ({ page }) => {
    const list = await settlements(page)
    const [statement] = list.statements
    test.skip(!statement, 'no month has closed into a statement on this database yet')
    if (!statement) {
      return
    }
    const detail = await data<DetailView>(
      await page.request.get(`/api/settlements/${statement.id}`),
    )
    expect(detail.canReverse).toBe(true)

    await openSettlements(page, list)
    await statementButton(page, statement).click()
    const panel = page.getByRole('dialog', {
      name: `${statement.branchA.name} and ${statement.branchB.name}, ${monthLabel(statement.month)}`,
    })
    await expect(panel).toBeVisible()

    const table = panel.getByRole('table', { name: "The statement's entries" })
    await expect(table.locator('tbody tr')).toHaveCount(detail.entries.length)
    const csvLink = panel.getByRole('link', { name: 'Download CSV' })
    await expect(csvLink).toHaveAttribute('href', `/api/settlements/${statement.id}?format=csv`)

    const csv = await page.request.get(`/api/settlements/${statement.id}?format=csv`)
    expect(csv.status()).toBe(200)
    expect(csv.headers()['content-type']).toBe('text/csv; charset=utf-8')
    expect(csv.headers()['content-disposition']).toMatch(
      new RegExp(`^attachment; filename="settlement-${statement.month}-[a-z0-9-]+\\.csv"$`),
    )
    const text = await csv.text()
    expect(text.split('\r\n')[0]).toContain(
      `${statement.branchA.name} and ${statement.branchB.name}`,
    )
  })

  test('the API refuses what it must, before writing anything', async ({ page }) => {
    const before = await settlements(page)

    const badMonth = await page.request.get('/api/settlements?month=2026-13')
    expect(badMonth.status()).toBe(400)

    const future = await page.request.post('/api/settlements/stl-e2e-missing/paid', {
      data: { paidOn: '2999-01-01', reference: 'E2E: a future payment' },
    })
    expect(future.status()).toBe(400)

    const missing = await page.request.post('/api/settlements/stl-e2e-missing/paid', {
      data: { paidOn: '2026-01-01', reference: 'E2E: no such statement' },
    })
    expect(missing.status()).toBe(404)

    const noReason = await page.request.post('/api/settlements/entries/ste-e2e-missing/reverse', {
      data: { note: 'no' },
    })
    expect(noReason.status()).toBe(400)

    const noEntry = await page.request.post('/api/settlements/entries/ste-e2e-missing/reverse', {
      data: { note: 'E2E: there is no such entry' },
    })
    expect(noEntry.status()).toBe(404)

    const after = await settlements(page)
    expect(after.statements.map((s) => [s.id, s.paid === null])).toEqual(
      before.statements.map((s) => [s.id, s.paid === null]),
    )
  })

  test('Reports shows memberships and gems across branches, with the statements', async ({
    page,
  }) => {
    await page.goto('/reports')
    const card = page.getByRole('region', { name: 'Memberships and gems across branches' })
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.getByText('To receive').first()).toBeVisible()
    await card.getByRole('link', { name: 'Statements →' }).click()
    await expect(page).toHaveURL(/\/settlements$/)
  })
})

describeAs('owner', 'Settlements', () => {
  test('lists only pairs with a branch they own, without corrections', async ({ page }) => {
    const list = await settlements(page)
    expect(list.scope).toBe('owner')

    const { branches } = await myBranches(page.request)
    const owned = new Set(branches.filter((b) => b.role === 'owner').map((b) => b.id))
    for (const statement of [...list.statements, ...list.open]) {
      expect(owned.has(statement.branchA.id) || owned.has(statement.branchB.id)).toBe(true)
    }

    const [statement] = list.statements
    if (statement) {
      const detail = await data<DetailView>(
        await page.request.get(`/api/settlements/${statement.id}`),
      )
      expect(detail.canReverse).toBe(false)
    }
    const correction = await page.request.post('/api/settlements/entries/ste-e2e-missing/reverse', {
      data: { note: 'E2E: an Owner may not correct' },
    })
    expect(correction.status()).toBe(403)

    await openSettlements(page, list)
    await expect(page.getByRole('button', { name: 'Reverse' })).toHaveCount(0)
  })
})

const CLOSED_TO: readonly AdminRole[] = ['manager', 'receptionist']

for (const role of CLOSED_TO) {
  describeAs(role, 'Settlements', () => {
    test('are closed, without saying whether a statement exists', async ({ page }) => {
      const response = await page.goto('/settlements', { waitUntil: 'domcontentloaded' })
      // The middleware answers 403; an impersonating dev server skips it, and
      // the page itself refuses.
      if (response?.status() !== 403) {
        await expect(page.getByText("Settlements aren't available here")).toBeVisible()
      }

      expect((await page.request.get('/api/settlements')).status()).toBe(404)
      expect((await page.request.get('/api/settlements/stl-e2e-missing')).status()).toBe(404)
      const pay = await page.request.post('/api/settlements/stl-e2e-missing/paid', {
        data: { paidOn: '2026-01-01', reference: 'E2E: not an Owner' },
      })
      expect(pay.status()).toBe(404)
    })

    if (role === 'manager') {
      test('Reports shows minutes and gems without the money', async ({ page }) => {
        await page.goto('/reports')
        const card = page.getByRole('region', { name: 'Memberships and gems across branches' })
        await expect(card).toBeVisible({ timeout: 30_000 })
        await expect(
          card.getByText("Amounts are for the branch's Owner and the Developer."),
        ).toBeVisible()
        await expect(card.getByText('To receive')).toHaveCount(0)
        await expect(card.getByRole('link')).toHaveCount(0)
      })
    }
  })
}
