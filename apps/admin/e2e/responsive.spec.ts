import { expect, test } from '@playwright/test'
import { hasRoleState, roleStatePath } from './fixtures/auth'

/************************************************************
 * Admin responsive-behaviour E2E (Req 3.4, 3.5, 14.1, 14.2, 14.3, 14.4)
 *
 * Drives a representative redesigned route (`/bookings` — a DataTable-backed
 * list page rendered inside AdminShell) across the supported viewport band and
 * asserts the responsive contract of the redesign:
 *
 *   - No horizontal PAGE overflow at any width from 375px → 1920px: the document
 *     never produces a horizontal scrollbar and no content extends past the
 *     viewport's right edge (Req 14.3).
 *   - On 375–1023px the DataTable confines horizontal scrolling to its OWN
 *     `overflow-x-auto` region (the table wrapper is the scroll container) while
 *     the surrounding page stays put (Req 14.1).
 *   - The Sidebar is a persistent rail at ≥1024px (Req 3.4) and a hidden overlay
 *     drawer at <1024px that the toggle opens (Req 3.5).
 *   - The user-name text is hidden <1024px (the avatar stays visible/operable)
 *     and both avatar + name show ≥1024px (Req 14.2, 14.4).
 *
 * AUTH: these routes require an authenticated admin session. As with the RBAC
 * matrix (rbac.spec.ts) we reuse the seeded `receptionist` storageState — a
 * Receptionist (level 2) reaches `/bookings`. The block self-skips when no
 * seeded state exists, so the suite stays enumerable/typecheckable without
 * seeds and runs fully in CI/local against a built admin server (per
 * playwright.config.ts) or a deployed/seeded environment.
 *
 * The redesign uses a 1024px (Tailwind `lg`) breakpoint between the persistent
 * rail and the overlay drawer (design.md §"Responsive"), so the band is split
 * at MOBILE (<1024) vs DESKTOP (≥1024) widths below.
 *
 * REQUIREMENT MAPPING (current requirements.md numbering — Requirement 19,
 * "Responsive Behaviour"). The per-test titles below retain the historical
 * draft numbers (3.4/3.5/14.x) for continuity; they map onto Req 19 as:
 *   - Req 19.1 → table-only horizontal scroll, no page overflow, 375–1023px
 *     (titled "Req 14.1").
 *   - Req 19.2 → user-name text hidden below 1024px, avatar retained/operable
 *     (titled "Req 14.2").
 *   - Req 19.3 → no horizontal PAGE overflow across the full 375→1920px band
 *     (titled "Req 14.3").
 *   - Req 19.4 → avatar + user-name both shown at ≥1024px (titled "Req 14.4").
 *   - Req 19.5 → interactive controls present a ≥44×44 CSS-px touch target
 *     below 1024px (the dedicated test block below + the avatar check in 19.2).
 *   - Sidebar persistent rail ≥1024px / overlay drawer <1024px is the
 *     App_Shell responsive criterion (titled "Req 3.4"/"Req 3.5").
 *
 * PREREQUISITE: Playwright browsers must be installed once per environment
 * (`bunx playwright install chromium`). `bunx playwright test --list` enumerates
 * the suite WITHOUT launching a browser, so collection/typecheck succeed even
 * when browsers are absent; an actual run additionally needs a built admin
 * server (see playwright.config.ts `webServer`) and a seeded role session.
 ************************************************************/

/** Representative redesigned route: a DataTable list page inside AdminShell. */
const ROUTE = '/bookings'

/** The redesign's rail↔drawer breakpoint (Tailwind `lg`). */
const LG_BREAKPOINT = 1024

/** Mobile/tablet widths in the 375–1023px band (Req 14.1, 14.2, 14.3 lower half). */
const MOBILE_WIDTHS = [375, 414, 768, 1023] as const

/** Desktop widths in the 1024–1920px band (Req 14.3 upper half, 3.4, 14.4). */
const DESKTOP_WIDTHS = [1024, 1280, 1440, 1920] as const

const VIEWPORT_HEIGHT = 800

/**
 * Navigate to the route, self-skipping when the environment can't serve an
 * authenticated admin session (external origin unreachable, or the session
 * bounces off the admin origin). Mirrors the resilience of auth-redirect.spec.
 */
async function gotoRoute(page: import('@playwright/test').Page): Promise<void> {
  let res: Awaited<ReturnType<import('@playwright/test').Page['goto']>> = null
  try {
    res = await page.goto(ROUTE, { waitUntil: 'domcontentloaded' })
  } catch {
    test.skip(true, 'admin route unreachable from this environment')
    return
  }
  // A redirect away from the admin origin means the seeded session was not
  // honoured here — skip rather than assert against the wrong page.
  if (!new URL(page.url()).pathname.startsWith(ROUTE)) {
    test.skip(true, 'seeded session did not reach the admin route in this environment')
  }
  expect(res?.status(), `${ROUTE} should render (200)`).toBe(200)
}

/**
 * Assert the document produces no horizontal overflow at the current viewport.
 * `clientWidth` excludes a vertical scrollbar, so `scrollWidth <= clientWidth`
 * (+1px rounding tolerance) means nothing extends past the right edge and no
 * horizontal page scrollbar exists.
 */
async function expectNoHorizontalPageOverflow(
  page: import('@playwright/test').Page,
  width: number,
): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      docScroll: doc.scrollWidth,
      docClient: doc.clientWidth,
      bodyScroll: document.body.scrollWidth,
      bodyClient: document.body.clientWidth,
    }
  })

  expect(
    overflow.docScroll,
    `document overflows horizontally at ${width}px (scrollWidth ${overflow.docScroll} > clientWidth ${overflow.docClient})`,
  ).toBeLessThanOrEqual(overflow.docClient + 1)

  expect(
    overflow.bodyScroll,
    `body overflows horizontally at ${width}px (scrollWidth ${overflow.bodyScroll} > clientWidth ${overflow.bodyClient})`,
  ).toBeLessThanOrEqual(overflow.bodyClient + 1)
}

test.describe('admin portal responsive behaviour', () => {
  test.skip(
    !hasRoleState('receptionist'),
    'no seeded storageState for "receptionist" (set ADMIN_E2E_RECEPTIONIST_STATE)',
  )
  test.use({ storageState: roleStatePath('receptionist') })

  // ── Req 14.3: no horizontal page overflow across the full 375 → 1920px band ──
  for (const width of [...MOBILE_WIDTHS, ...DESKTOP_WIDTHS]) {
    test(`no horizontal page overflow at ${width}px (Req 14.3)`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await gotoRoute(page)
      await expectNoHorizontalPageOverflow(page, width)
    })
  }

  // ── Req 14.1: table scrolls within its own region on 375–1023px ──────────────
  for (const width of MOBILE_WIDTHS) {
    test(`data table owns horizontal scroll, page does not, at ${width}px (Req 14.1)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await gotoRoute(page)

      const scrollRegion = page.getByTestId('data-table-scroll').first()
      // If the representative page renders no table yet (e.g. empty dataset
      // collapses to an empty-state card), there is nothing to assert here.
      if ((await scrollRegion.count()) === 0) {
        test.skip(true, 'no DataTable rendered on the route in this environment')
        return
      }

      // The wrapper — not the page — is the horizontal scroll container.
      const overflowX = await scrollRegion.evaluate(
        (el) => getComputedStyle(el).overflowX,
      )
      expect(['auto', 'scroll'], `table region must be horizontally scrollable at ${width}px`)
        .toContain(overflowX)

      // Whatever the table's intrinsic width, the page itself must not scroll.
      await expectNoHorizontalPageOverflow(page, width)

      // The table content is confined to the wrapper: the wrapper never forces
      // the document wider than the viewport.
      const docOverflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(docOverflows, `page must not scroll horizontally at ${width}px`).toBe(false)
    })
  }

  // ── Req 3.5: sidebar is a hidden overlay drawer the toggle opens, <1024px ─────
  test('sidebar is an overlay drawer below 1024px (Req 3.5)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
    await gotoRoute(page)

    // The persistent rail nav is hidden below the breakpoint.
    await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeHidden()

    // The toggle is present (it is `lg:hidden`, shown only on mobile).
    const toggle = page.getByRole('button', { name: 'Open navigation menu' })
    await expect(toggle).toBeVisible()

    // Activating it opens the overlay drawer (Radix Dialog, titled "Navigation menu").
    await toggle.click()
    const drawer = page.getByRole('dialog', { name: 'Navigation menu' })
    await expect(drawer).toBeVisible()
    // The drawer exposes the navigation landmark while open.
    await expect(drawer.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible()
  })

  // ── Req 3.4: sidebar is a persistent rail at ≥1024px ──────────────────────────
  test('sidebar is a persistent rail at 1024px and above (Req 3.4)', async ({ page }) => {
    await page.setViewportSize({ width: LG_BREAKPOINT, height: VIEWPORT_HEIGHT })
    await gotoRoute(page)

    // The rail nav is persistently visible alongside the content…
    await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible()
    // …and the mobile toggle is hidden (no drawer affordance on desktop).
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeHidden()
  })

  // ── Req 14.2: user-name text hidden <1024px, avatar retained ──────────────────
  for (const width of MOBILE_WIDTHS) {
    test(`user-name text hidden, avatar operable, at ${width}px (Req 14.2)`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await gotoRoute(page)

      // Name/role text block is hidden below 1024px.
      await expect(page.getByTestId('user-identity-text')).toBeHidden()

      // The avatar control remains visible and meets the 44×44px touch target.
      const avatar = page.locator('button[aria-label*=","]').first()
      await expect(avatar).toBeVisible()
      const box = await avatar.boundingBox()
      expect(box, 'avatar must have a measurable box').not.toBeNull()
      expect(box?.width ?? 0, 'avatar width ≥ 44px').toBeGreaterThanOrEqual(44)
      expect(box?.height ?? 0, 'avatar height ≥ 44px').toBeGreaterThanOrEqual(44)
    })
  }

  // ── Req 14.4: avatar + name shown ≥1024px ─────────────────────────────────────
  for (const width of DESKTOP_WIDTHS) {
    test(`user-name text and avatar both shown at ${width}px (Req 14.4)`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await gotoRoute(page)

      await expect(page.getByTestId('user-identity-text')).toBeVisible()
      await expect(page.locator('button[aria-label*=","]').first()).toBeVisible()
    })
  }

  // ── Req 19.5: shell tap affordances meet the ≥44×44px touch target <1024px ───
  // Below 1024px every interactive control must present a ≥44×44 CSS-px touch
  // target. The App_Shell's persistent mobile chrome exposes two such controls
  // on every authenticated route regardless of dataset — the sidebar toggle
  // (`size-11`) and the user-identity avatar trigger (`min-h-11 min-w-11`) — so
  // they are asserted directly here as the reachable-surface gate for Req 19.5.
  for (const width of MOBILE_WIDTHS) {
    test(`shell tap affordances are ≥44×44px at ${width}px (Req 19.5)`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await gotoRoute(page)

      const controls = [
        page.getByRole('button', { name: 'Open navigation menu' }),
        page.locator('button[aria-label*=","]').first(),
      ]

      for (const control of controls) {
        await expect(control).toBeVisible()
        const box = await control.boundingBox()
        expect(box, 'interactive control must have a measurable box').not.toBeNull()
        expect(box?.width ?? 0, `control width ≥ 44px at ${width}px`).toBeGreaterThanOrEqual(44)
        expect(box?.height ?? 0, `control height ≥ 44px at ${width}px`).toBeGreaterThanOrEqual(44)
      }
    })
  }
})
