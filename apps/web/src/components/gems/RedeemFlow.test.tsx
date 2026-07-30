/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : RedeemFlow (component test)
 * Scope        : Gems Redemption UI — dialog wiring + accessibility
 *
 * Feature      : gems-redemption
 * Task         : 8.3 — RedeemFlow component test
 *
 * Description  : Component tests for the /gems redemption flow. Verifies an
 *                affordable service opens the dialog, a date selection fetches
 *                GET /api/availability, confirming POSTs to /api/gems/redeem with
 *                a generated idempotencyKey, the confirmation surfaces the
 *                booking reference and the updated balance, the confirm button is
 *                disabled while in flight, non-affordable services are disabled,
 *                and the dialog meets its WCAG 2.1 AA obligations (focus trap,
 *                labelled controls, aria-live result region).
 *
 * Validates: Requirements 2.1, 2.2, 6.1, 9.2, 9.3
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, MSW
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        : Endpoints are mocked with MSW — no real network. The
 *                idempotencyKey is asserted to satisfy the server contract
 *                (8–64 chars) and to stay STABLE across retries of one attempt
 *                while differing between attempts.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { delay, HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { server } from '@/test/msw-server'
import { RedeemFlow } from './RedeemFlow'

const AFFORDABLE = {
  id: 'svc_facial',
  name: 'Signature Facial',
  gemsRequired: 500,
  pricePaise: 250_000,
  affordable: true,
}

const UNAFFORDABLE = {
  id: 'svc_spa_day',
  name: 'Spa Day Ritual',
  gemsRequired: 5000,
  pricePaise: 1_200_000,
  affordable: false,
}

function slots() {
  return {
    slots: [
      { startTime: '10:00', endTime: '10:30', available: true },
      { startTime: '10:30', endTime: '11:00', available: false },
    ],
  }
}

function renderFlow(balance = 1000, catalogue = [AFFORDABLE, UNAFFORDABLE]) {
  return render(<RedeemFlow balance={balance} catalogue={catalogue} />)
}

/** Open the dialog, pick the first date, pick the 10:00 slot. */
async function openAndPickSlot() {
  fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))
  const dialog = await screen.findByRole('dialog')

  const dateButtons = screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-pressed'))
  fireEvent.click(dateButtons[0] as HTMLElement)

  fireEvent.click(await screen.findByRole('button', { name: '10:00' }))
  return dialog
}

afterEach(cleanup)

describe('RedeemFlow — catalogue affordability (Req 2.1, 2.2)', () => {
  it('offers Redeem for an affordable service and disables an unaffordable one with a hint', () => {
    renderFlow()

    expect(screen.getByRole('button', { name: 'Redeem' })).toBeEnabled()

    const blocked = screen.getByRole('button', { name: 'Not enough gems' })
    expect(blocked).toBeDisabled()
    expect(blocked).toHaveAttribute('aria-disabled', 'true')
    // 5000 - 1000 = 4000 gems short.
    expect(screen.getByText('Need 4,000 more')).toBeInTheDocument()
  })

  it('re-derives affordability from the live balance, not just the server flag', () => {
    // Server said affordable, but the balance passed down cannot cover the cost:
    // the all-or-nothing rule wins and the action stays disabled.
    renderFlow(100, [{ ...AFFORDABLE, affordable: true }])

    expect(screen.queryByRole('button', { name: 'Redeem' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not enough gems' })).toBeDisabled()
  })

  it('shows an empty-state message when the catalogue is empty', () => {
    renderFlow(1000, [])

    expect(screen.getByText(/No rewards are available right now/i)).toBeInTheDocument()
  })
})

describe('RedeemFlow — dialog wiring', () => {
  it('opens a labelled modal dialog for an affordable service', async () => {
    renderFlow()

    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Redeem with Gems' })).toBeInTheDocument()
    // The dialog restates the chosen service and its gem cost.
    expect(dialog).toHaveTextContent('Signature Facial')
    expect(dialog).toHaveTextContent('500 gems')
  })

  it('fetches GET /api/availability for the selected date and marks taken slots unavailable', async () => {
    let requestedDate: string | null = null
    let requestedBranch: string | null = null
    server.use(
      http.get('*/api/availability', ({ request }) => {
        const url = new URL(request.url)
        requestedDate = url.searchParams.get('date')
        requestedBranch = url.searchParams.get('branchId')
        return HttpResponse.json({ success: true, data: slots() })
      }),
    )

    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))
    const dateButtons = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-pressed'))
    fireEvent.click(dateButtons[0] as HTMLElement)

    expect(await screen.findByRole('button', { name: '10:00' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '10:30' })).toBeDisabled()
    expect(requestedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(requestedBranch).toBe('branch_rayasandra')
  })

  it('POSTs to /api/gems/redeem with a contract-valid idempotencyKey and shows the confirmation', async () => {
    let posted: Record<string, unknown> | null = null
    server.use(
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
      http.post('*/api/gems/redeem', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          {
            success: true,
            data: {
              bookingNumber: 'BK-RS-2606-H-38291',
              reference: 'BK-RS-2606-H-38291',
              gemsSpent: 500,
              newBalance: 500,
            },
          },
          { status: 201 },
        )
      }),
    )

    renderFlow()
    await openAndPickSlot()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Redemption' }))

    // Booking reference + updated balance are both surfaced (Req 9.2, 9.3).
    const reference = await screen.findByText('BK-RS-2606-H-38291')
    expect(reference).toBeInTheDocument()
    expect(screen.getByText('Gems Redeemed!')).toBeInTheDocument()
    // The updated balance is reported inside the confirmation region.
    expect(reference.closest('output')).toHaveTextContent('Updated balance: 500 gems')

    const payload = posted as unknown as Record<string, unknown>
    expect(payload).toMatchObject({
      serviceId: 'svc_facial',
      branchId: 'branch_rayasandra',
      startTime: '10:00',
    })
    expect(payload.bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Never sends a gems amount — the server reads gemsRequired (Req 7.3).
    expect(payload.gemsRequired).toBeUndefined()
    // Satisfies redeemGemsSchema's 8–64 character bound (Req 6.1).
    const key = payload.idempotencyKey as string
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThanOrEqual(8)
    expect(key.length).toBeLessThanOrEqual(64)
  })

  it('disables the confirm button while the redemption is in flight (Req 6.1)', async () => {
    let posts = 0
    server.use(
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
      http.post('*/api/gems/redeem', async () => {
        posts += 1
        await delay(50)
        return HttpResponse.json(
          {
            success: true,
            data: { bookingNumber: 'BK-RS-2606-H-00001', reference: 'BK-RS-2606-H-00001' },
          },
          { status: 201 },
        )
      }),
    )

    renderFlow()
    await openAndPickSlot()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Redemption' }))

    // While submitting, the action is disabled and announces itself busy — a
    // double-click cannot fire a second request.
    const busy = await screen.findByRole('button', { name: /Redeeming/ })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(busy)

    await screen.findByText('BK-RS-2606-H-00001')
    expect(posts).toBe(1)
  })

  it('reuses one idempotencyKey across retries of a single attempt, and a fresh key per attempt', async () => {
    const keys: string[] = []
    let failNext = true
    server.use(
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
      http.post('*/api/gems/redeem', async ({ request }) => {
        const payload = (await request.json()) as { idempotencyKey: string }
        keys.push(payload.idempotencyKey)
        if (failNext) {
          failNext = false
          return HttpResponse.json(
            { success: false, error: { code: 'INTERNAL_ERROR', message: 'Please try again.' } },
            { status: 500 },
          )
        }
        return HttpResponse.json(
          {
            success: true,
            data: { bookingNumber: 'BK-RS-2606-H-11111', reference: 'BK-RS-2606-H-11111' },
          },
          { status: 201 },
        )
      }),
    )

    renderFlow()
    await openAndPickSlot()

    // Attempt 1, submission 1 — fails.
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Redemption' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.')

    // Attempt 1, submission 2 — the SAME key, so the server can de-dupe.
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Redemption' }))
    await screen.findByText('BK-RS-2606-H-11111')
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])

    // A brand-new attempt gets a brand-new key.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await openAndPickSlot()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Redemption' }))
    await waitFor(() => expect(keys).toHaveLength(3))
    expect(keys[2]).not.toBe(keys[0])
  })

  it('surfaces an insufficient-balance rejection without pretending it succeeded', async () => {
    server.use(
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
      http.post('*/api/gems/redeem', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'GEMS_INSUFFICIENT_BALANCE',
              message: 'You do not have enough gems to redeem this service.',
            },
          },
          { status: 409 },
        ),
      ),
    )

    renderFlow()
    await openAndPickSlot()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Redemption' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/not have enough gems/i)
    expect(screen.queryByText('Gems Redeemed!')).not.toBeInTheDocument()
  })
})

describe('RedeemFlow — accessibility (WCAG 2.1 AA)', () => {
  it('labels the date and time controls and moves focus into the dialog on open', async () => {
    server.use(
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
    )

    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))
    const dialog = await screen.findByRole('dialog')

    // Focus is trapped inside the dialog from the moment it opens.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    // The date group carries an accessible name straight away.
    expect(screen.getByRole('group', { name: 'Select Date' })).toBeInTheDocument()

    // The time group appears (labelled) once slots have loaded for a date.
    const dateButtons = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-pressed'))
    fireEvent.click(dateButtons[0] as HTMLElement)
    expect(await screen.findByRole('group', { name: 'Select Time' })).toBeInTheDocument()
  })

  it('wraps Tab focus at the dialog boundary', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))
    const modal = (await screen.findByRole('dialog')).querySelector<HTMLElement>(
      '[aria-labelledby="redeem-dialog-title"] > div, div:nth-of-type(2)',
    )
    expect(modal).not.toBeNull()

    const focusable = Array.from(
      (modal as HTMLElement).querySelectorAll<HTMLElement>('button:not([disabled])'),
    )
    const first = focusable[0] as HTMLElement
    const last = focusable[focusable.length - 1] as HTMLElement
    expect(focusable.length).toBeGreaterThan(1)

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('announces the result in an aria-live region and closes on Escape', async () => {
    server.use(
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
      http.post('*/api/gems/redeem', () =>
        HttpResponse.json(
          {
            success: true,
            data: {
              bookingNumber: 'BK-RS-2606-H-22222',
              reference: 'BK-RS-2606-H-22222',
              gemsSpent: 500,
              newBalance: 500,
            },
          },
          { status: 201 },
        ),
      ),
    )

    renderFlow()
    await openAndPickSlot()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Redemption' }))

    const reference = await screen.findByText('BK-RS-2606-H-22222')
    const liveRegion = reference.closest('output')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
