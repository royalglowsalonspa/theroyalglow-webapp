/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service-sync.spec
 * Scope        : CMS E2E — Payload → Drizzle Service Sync
 *
 * Description  : End-to-end proof that authoring in the Payload admin panel
 *                mirrors into the booking engine's Drizzle tables. Every step
 *                drives the REAL admin UI (no Local API shortcuts) and then
 *                asserts against the live `public.*` rows the booking engine
 *                reads.
 *
 * Covers :
 * - Requirement 3.3 — category create syncs to `public.service_category`
 * - Requirement 3.1 — service create syncs to `public.service`
 * - Requirement 3.2 — service update syncs by id
 * - Requirement 3.9 / 12.2 — a failing sync re-throws: HTTP 500 surfaced in the
 *   admin UI AND the `cms.*` write rolled back (no divergence)
 *
 * Tech Stack   : Playwright, Payload CMS v3, Drizzle ORM, Neon PostgreSQL
 * Layer        : CMS (E2E)
 *
 * Run          : cd apps/cms && bunx playwright test
 *
 * ─── DATABASE SAFETY ───────────────────────────────────────
 * This suite writes to the LIVE dev catalogue. Three guards:
 *   1. Every row it creates is prefixed `zz-e2e-` (see E2E_PREFIX).
 *   2. `beforeAll` runs cleanup FIRST and records the baseline counts.
 *   3. `afterAll` cleans up unconditionally, then asserts the counts are back
 *      to that baseline with ZERO id drift between `cms.*` and `public.*`.
 * Delete is disabled in the CMS by design, so teardown removes the throwaway
 * rows with direct SQL in both schemas — the accepted test-only exception.
 *
 * ─── SCOPE NOTE ON THE SYNC-FAILURE CASE (be precise here) ──
 * The spec's fourth scenario is worded "mock a Drizzle connection failure".
 * That is NOT honestly reachable from a browser test: the sync writes on
 * Payload's own SERVER-SIDE transaction handle, so `page.route()` cannot touch
 * it, and killing the connection would also kill the login, the `cms.*` write,
 * and the CMS itself — proving nothing about the hook.
 *
 * What is proven instead is the SAME failure path, triggered for real: a row is
 * planted in `public.service` that has no `cms.service` counterpart, so the CMS
 * create passes Payload's own unique-slug check and then the hook's insert
 * violates the UNIQUE index on `public.service.slug`. The hook logs, re-throws,
 * Payload rolls the whole transaction back and returns 500 to the admin UI.
 *
 * PROVEN: hook failure → HTTP 500 to the UI → `cms.*` rolled back → no
 *         divergence, no orphan row.
 * NOT PROVEN here: the specific "database unreachable / connection timeout"
 *         trigger of Requirement 12.7. That is covered at the unit level in
 *         `src/hooks/__tests__/sync-service.test.ts`, where the transaction
 *         handle is stubbed to reject and the hook is asserted to log and
 *         re-throw — the re-throw being exactly what produces this 500.
 ************************************************************/
import { randomBytes } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { createTestAdmin, generateTestAdmin, loginToPayload, type TestAdmin } from './support/admin'
import {
  anyPublicCategoryId,
  type CatalogueCounts,
  catalogueCounts,
  catalogueDrift,
  cleanupE2eRows,
  cmsCategoryIdBySlug,
  cmsServiceExists,
  cmsServiceIdBySlug,
  E2E_PREFIX,
  findPublicCategoryBySlug,
  findPublicServiceBySlug,
  insertPublicOnlyService,
} from './support/db'

// One browser session, ordered steps: the service create depends on the
// category created by the first test (categoryId is a required relationship).
test.describe.configure({ mode: 'serial' })

const RUN_ID = randomBytes(4).toString('hex')
const CATEGORY_NAME = `${E2E_PREFIX}cat-${RUN_ID}`
const SERVICE_NAME = `${E2E_PREFIX}svc-${RUN_ID}`
const SERVICE_RENAMED = `${E2E_PREFIX}svc-${RUN_ID}-renamed`
const CONFLICT_SLUG = `${E2E_PREFIX}conflict-${RUN_ID}`

const SERVICE_PRICE_PAISE = 149_900
const SERVICE_DURATION = '45'

let page: Page
let admin: TestAdmin
let baseline: CatalogueCounts
let serviceId: string

/** Payload's `select` / `relationship` inputs are react-select comboboxes. */
async function chooseOption(target: Page, fieldName: string, optionLabel: string): Promise<void> {
  const field = target.locator(`#field-${fieldName}`)
  await field.click()
  await target.locator('.rs__option', { hasText: optionLabel }).first().click()
}

/** Click Save and hand back the API response Payload made for it. */
async function saveAndWaitFor(
  target: Page,
  method: 'POST' | 'PATCH',
  urlFragment: string,
): Promise<number> {
  const responsePromise = target.waitForResponse(
    (response) =>
      response.url().includes(urlFragment) &&
      response.request().method() === method &&
      // Payload sends a `depth`-less PATCH plus autosave/lock traffic; only the
      // document write itself is interesting.
      !response.url().includes('/payload-locked-documents'),
  )
  await target.locator('#action-save').click()
  const response = await responsePromise
  return response.status()
}

test.beforeAll(async ({ browser }) => {
  expect(
    process.env.DATABASE_URL,
    'DATABASE_URL must be set (loaded from apps/cms/.env.local by playwright.config.ts)',
  ).toBeTruthy()

  // Clean first, THEN baseline: residue from an aborted earlier run must not be
  // baked into the numbers this suite is measured against.
  await cleanupE2eRows()
  baseline = await catalogueCounts()
  const drift = await catalogueDrift()

  expect(baseline.publicService, 'public.service and cms.service must start aligned').toBe(
    baseline.cmsService,
  )
  expect(baseline.publicCategory).toBe(baseline.cmsCategory)
  expect(drift).toEqual({
    serviceOnlyInCms: 0,
    serviceOnlyInPublic: 0,
    categoryOnlyInCms: 0,
    categoryOnlyInPublic: 0,
  })
  console.log(`[e2e] baseline ${JSON.stringify(baseline)}`)

  admin = generateTestAdmin()
  createTestAdmin(admin)

  page = await browser.newPage()
  await loginToPayload(page, admin)
})

test.afterAll(async () => {
  try {
    await cleanupE2eRows()
  } finally {
    await page?.close()
  }

  const counts = await catalogueCounts()
  const drift = await catalogueDrift()
  console.log(`[e2e] end state ${JSON.stringify(counts)} drift ${JSON.stringify(drift)}`)

  expect(counts, 'catalogue counts must return to the pre-run baseline').toEqual(baseline)
  expect(drift, 'cms.* and public.* ids must stay aligned').toEqual({
    serviceOnlyInCms: 0,
    serviceOnlyInPublic: 0,
    categoryOnlyInCms: 0,
    categoryOnlyInPublic: 0,
  })
})

test('creating a service category in Payload syncs it to public.service_category', async () => {
  await page.goto('/admin/collections/service_category/create')
  await page.locator('#field-name').fill(CATEGORY_NAME)
  await chooseOption(page, 'serviceType', 'Salon')

  expect(await saveAndWaitFor(page, 'POST', '/api/service_category')).toBe(201)

  // `slug` is left blank on purpose — the beforeChange hook derives it from the
  // name, so this also proves auto-generation end to end.
  const row = await findPublicCategoryBySlug(CATEGORY_NAME)
  expect(row, `public.service_category row for ${CATEGORY_NAME}`).toBeDefined()
  expect(row?.name).toBe(CATEGORY_NAME)
  expect(row?.serviceType).toBe('salon')
  expect(row?.isActive).toBe(true)

  // Same id in both schemas — the point of the custom nanoid `id` override.
  expect(await cmsCategoryIdBySlug(CATEGORY_NAME)).toBe(row?.id)
})

test('creating a service in Payload syncs it to public.service', async () => {
  await page.goto('/admin/collections/service/create')
  await page.locator('#field-name').fill(SERVICE_NAME)
  await chooseOption(page, 'categoryId', CATEGORY_NAME)
  await chooseOption(page, 'durationMinutes', `${SERVICE_DURATION} minutes`)
  await page.locator('#field-pricePaise').fill(String(SERVICE_PRICE_PAISE))

  expect(await saveAndWaitFor(page, 'POST', '/api/service')).toBe(201)

  const row = await findPublicServiceBySlug(SERVICE_NAME)
  expect(row, `public.service row for ${SERVICE_NAME}`).toBeDefined()
  expect(row?.name).toBe(SERVICE_NAME)
  expect(row?.pricePaise).toBe(SERVICE_PRICE_PAISE)
  // Payload hands the select value over as a STRING; the mapper coerces it.
  expect(row?.durationMinutes).toBe(Number(SERVICE_DURATION))
  expect(row?.isActive).toBe(true)
  expect(row?.categoryId).toBe(await cmsCategoryIdBySlug(CATEGORY_NAME))

  const cmsId = await cmsServiceIdBySlug(SERVICE_NAME)
  expect(cmsId).toBe(row?.id)
  serviceId = row?.id as string
})

test('renaming a service in Payload updates the matching public.service row', async () => {
  const before = await findPublicServiceBySlug(SERVICE_NAME)
  expect(before).toBeDefined()

  await page.goto(`/admin/collections/service/${serviceId}`)
  await page.locator('#field-name').fill(SERVICE_RENAMED)

  expect(await saveAndWaitFor(page, 'PATCH', `/api/service/${serviceId}`)).toBe(200)

  // Slug is unchanged by a rename (auto-generation is create-only), so the row
  // is still found by the original slug — matched by id, per Requirement 3.2.
  const after = await findPublicServiceBySlug(SERVICE_NAME)
  expect(after?.id).toBe(serviceId)
  expect(after?.name).toBe(SERVICE_RENAMED)
  expect(after?.createdAt.getTime(), 'createdAt must never be rewritten').toBe(
    before?.createdAt.getTime(),
  )
  expect(after?.updatedAt.getTime()).toBeGreaterThanOrEqual(before?.updatedAt.getTime() as number)
})

test('a failing sync returns 500 to the admin UI and rolls the CMS write back', async () => {
  // Plant a public-only row so the hook's insert hits the UNIQUE slug index.
  // See the SCOPE NOTE in the file header for why this stands in for "mock a
  // connection failure", and what it does and does not prove.
  await insertPublicOnlyService({
    id: `${E2E_PREFIX}${RUN_ID}-planted`,
    slug: CONFLICT_SLUG,
    name: `${E2E_PREFIX}planted-${RUN_ID}`,
    categoryId: await anyPublicCategoryId(),
  })

  await page.goto('/admin/collections/service/create')
  await page.locator('#field-name').fill(`${E2E_PREFIX}doomed-${RUN_ID}`)
  // Slug set EXPLICITLY to the planted value: Payload's own unique check looks
  // at cms.service only, where this slug does not exist, so the request gets
  // past validation and into the hook.
  await page.locator('#field-slug').fill(CONFLICT_SLUG)
  await chooseOption(page, 'categoryId', CATEGORY_NAME)
  await chooseOption(page, 'durationMinutes', '30 minutes')
  await page.locator('#field-pricePaise').fill('100')

  expect(await saveAndWaitFor(page, 'POST', '/api/service')).toBe(500)

  // The failure is visible to the author, not swallowed (Requirement 12.2).
  await expect(page.locator('.payload-toast-item')).toBeVisible({ timeout: 15_000 })
  // Still on the create form — no document was made.
  await expect(page).toHaveURL(/\/admin\/collections\/service\/create/)

  // Rollback proof: no cms row, and public.service kept exactly the planted row.
  expect(await cmsServiceExists(CONFLICT_SLUG)).toBe(false)
  const planted = await findPublicServiceBySlug(CONFLICT_SLUG)
  expect(planted?.id).toBe(`${E2E_PREFIX}${RUN_ID}-planted`)
})
