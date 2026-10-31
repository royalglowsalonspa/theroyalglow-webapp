/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : CreateMembershipForm (component test)
 * Scope        : Admin Portal — selling a membership (multi-branch R9.3)
 *
 * Description  : Only active tiers are offered; choosing one prefills its
 *                usual hours, price and expiry. − and + move whole hours,
 *                stop at 1 hour and never touch the typed price (MS-15). The
 *                start date defaults to today in IST and moving it moves a
 *                tier's expiry, but not a hand-picked one. The form holds a
 *                sale back with the reason, sends whole hours and paise, shows
 *                the API's field errors and has no accessibility violations.
 *
 * Notes        : Date is faked to 25/10/2026 11:30 IST; timers stay real for
 *                the customer search debounce. `fetch` is stubbed.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))
vi.mock('next/navigation', () => ({ useRouter: () => routerMocks }))

import { CreateMembershipForm } from './create-membership-form'

expect.extend(toHaveNoViolations)

const TIER = {
  slug: 'x',
  description: null,
  sacCode: '999723',
  isActive: true,
}
const SILVER = {
  ...TIER,
  id: 'tier_silver',
  name: 'Silver',
  defaultHoursMinutes: 480,
  defaultPricePaise: 1_000_000,
  defaultValidityDays: 90,
  displayOrder: 1,
}
const GOLD = {
  ...TIER,
  id: 'tier_gold',
  name: 'Gold',
  defaultHoursMinutes: 900,
  defaultPricePaise: 1_500_000,
  defaultValidityDays: 90,
  displayOrder: 2,
}
const RETIRED = { ...SILVER, id: 'tier_old', name: 'Monsoon', isActive: false, displayOrder: 3 }
const ASHA = { id: 'cust_asha', name: 'Asha Rao', email: 'asha@example.com', phone: null }

type Call = { url: string; init: RequestInit | undefined }
let calls: Call[] = []
let saleReply: { status: number; body: unknown } = {
  status: 201,
  body: { success: true, data: { membership: { id: 'mem_new' }, invoice: { id: 'inv_new' } } },
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-25T06:00:00.000Z') })
  calls = []
  saleReply = {
    status: 201,
    body: { success: true, data: { membership: { id: 'mem_new' }, invoice: { id: 'inv_new' } } },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'POST') {
        return new Response(JSON.stringify(saleReply.body), { status: saleReply.status })
      }
      if (url.startsWith('/api/customers')) {
        return ok({ customers: [ASHA] })
      }
      return ok({ tiers: [SILVER, GOLD, RETIRED], canEditTax: false })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const BRANCH = { id: 'branch_rs', name: 'Rayasandra' }

async function chooseCustomer() {
  fireEvent.change(screen.getByLabelText('Search customer'), { target: { value: 'As' } })
  fireEvent.click(await screen.findByRole('button', { name: /Asha Rao/ }))
}

async function chooseTier(name: string) {
  fireEvent.click(await screen.findByRole('radio', { name: new RegExp(name) }))
}

const hours = () => screen.getByLabelText('Hours') as HTMLInputElement
const price = () => screen.getByLabelText('Agreed price (₹, GST-inclusive)') as HTMLInputElement
const start = () => screen.getByLabelText('Start date') as HTMLInputElement
const expiry = () => screen.getByLabelText('Expiry date') as HTMLInputElement
const sellButton = () => screen.getByRole('button', { name: 'Sell Membership' })

describe('CreateMembershipForm', () => {
  it('offers active tiers only, and a tier prefills its usual hours, price and expiry', async () => {
    const { container } = render(<CreateMembershipForm branch={BRANCH} />)

    await chooseTier('Gold')
    expect(screen.queryByRole('radio', { name: /Monsoon/ })).toBeNull()
    expect(hours().value).toBe('15')
    expect(price().value).toBe('15000')
    expect(start().value).toBe('2026-10-25')
    expect(expiry().value).toBe('2027-01-23')
    expect(
      screen.getByText('15 hours for ₹15,000.00 · 25/10/2026 to 23/01/2027 (90 days)'),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('moves hours in whole steps down to 1 hour without changing the price (MS-15)', async () => {
    render(<CreateMembershipForm branch={BRANCH} />)
    await chooseTier('Silver')
    fireEvent.change(price(), { target: { value: '9500' } })

    fireEvent.click(screen.getByRole('button', { name: 'One hour more' }))
    expect(hours().value).toBe('9')
    expect(price().value).toBe('9500')

    fireEvent.change(hours(), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'One hour less' }))
    expect(hours().value).toBe('1')
    expect(screen.getByRole('button', { name: 'One hour less' })).toBeDisabled()

    // A typed fraction is rounded to whole hours when the field is left.
    fireEvent.change(hours(), { target: { value: '7.6' } })
    fireEvent.blur(hours())
    expect(hours().value).toBe('8')
    expect(price().value).toBe('9500')
  })

  it('moves a tier’s expiry with the start date, but keeps a hand-picked expiry', async () => {
    render(<CreateMembershipForm branch={BRANCH} />)
    await chooseTier('Gold')

    fireEvent.change(start(), { target: { value: '2026-11-01' } })
    expect(expiry().value).toBe('2027-01-30')

    fireEvent.change(expiry(), { target: { value: '2027-03-31' } })
    fireEvent.change(start(), { target: { value: '2026-11-05' } })
    expect(expiry().value).toBe('2027-03-31')
  })

  it('holds the sale back with the reason until it is valid', async () => {
    render(<CreateMembershipForm branch={BRANCH} />)

    expect(screen.getByText('Choose the customer.')).toBeInTheDocument()
    expect(sellButton()).toBeDisabled()

    await chooseCustomer()
    await chooseTier('Gold')
    fireEvent.change(expiry(), { target: { value: '2026-10-25' } })
    expect(screen.getByText('The expiry date must be after the start date.')).toBeInTheDocument()
    expect(sellButton()).toBeDisabled()

    fireEvent.change(expiry(), { target: { value: '2027-01-23' } })
    fireEvent.change(price(), { target: { value: '' } })
    expect(screen.getByText('Enter the agreed price.')).toBeInTheDocument()
    expect(sellButton()).toBeDisabled()
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false)
  })

  it('sends whole hours and paise for the branch, then opens the membership', async () => {
    render(<CreateMembershipForm branch={BRANCH} />)
    await chooseCustomer()
    await chooseTier('Gold')
    fireEvent.click(screen.getByRole('button', { name: 'One hour more' }))
    fireEvent.change(price(), { target: { value: '14,000.50' } })
    fireEvent.click(screen.getByRole('radio', { name: 'UPI' }))

    fireEvent.click(sellButton())

    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith('/memberships/mem_new'))
    const sale = calls.find((c) => c.init?.method === 'POST')
    expect(sale?.url).toBe('/api/memberships')
    expect(JSON.parse(String(sale?.init?.body))).toEqual({
      branchId: 'branch_rs',
      customerId: 'cust_asha',
      tierId: 'tier_gold',
      hours: 16,
      pricePaise: 1_400_050,
      startDate: '2026-10-25',
      expiresOn: '2027-01-23',
      paymentMethod: 'upi',
    })
    expect(screen.getByText(/Custom deal\. Gold is usually 15 hours/)).toBeInTheDocument()
  })

  it('shows the API’s field errors beside their fields', async () => {
    saleReply = {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The expiry date must be after the start date.',
          statusCode: 400,
          details: { expiresOn: ['Choose a later date'] },
        },
      },
    }
    render(<CreateMembershipForm branch={BRANCH} />)
    await chooseCustomer()
    await chooseTier('Silver')

    fireEvent.click(sellButton())

    expect(await screen.findByText('Choose a later date')).toBeInTheDocument()
    expect(expiry()).toHaveAttribute('aria-invalid', 'true')
    expect(routerMocks.push).not.toHaveBeenCalled()
    expect(toastMocks.error).toHaveBeenCalled()
  })
})
