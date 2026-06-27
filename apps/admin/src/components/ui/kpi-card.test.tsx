/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : KPICard (component test)
 * Scope        : Admin — Dashboard KPI Card primitive
 *
 * Description  : Component tests for the presentation-only KPICard primitive.
 *                Verifies it renders the supplied label and the caller-pre-
 *                formatted value, renders an optional decorative lucide icon,
 *                and swaps the value for an announced loading placeholder while
 *                `loading`. Also confirms an INR-formatted value string
 *                (produced by the caller via formatINRWithPaise) renders
 *                verbatim — the card performs no formatting itself.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom
 * Layer        : Testing (Presentation / Component)
 *
 * Dependencies : @/components/ui/kpi-card, @/lib/admin/format, lucide-react
 *
 * Notes        :
 * - Validates: Requirements 10.1, 10.6
 * - `@testing-library/user-event` is not installed in the admin app; these are
 *   pure render assertions so no interaction driver is required.
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { IndianRupee } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'

import { formatINRWithPaise } from '@/lib/admin/format'
import { KPICard } from '@/components/ui/kpi-card'

afterEach(cleanup)

describe('KPICard rendering (Req 10.1)', () => {
  it('renders the supplied label and pre-formatted value', () => {
    render(<KPICard label="Today's Revenue" value="₹12,499.00" />)

    expect(screen.getByText("Today's Revenue")).toBeInTheDocument()
    expect(screen.getByText('₹12,499.00')).toBeInTheDocument()
  })

  it('renders an optional decorative lucide icon hidden from assistive tech', () => {
    const { container } = render(
      <KPICard label="Today's Revenue" value="₹12,499.00" icon={IndianRupee} />,
    )

    // The decorative icon is rendered as an aria-hidden svg (Icon wrapper),
    // so it never competes with the label/value for the accessible name.
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders without an icon when none is supplied', () => {
    const { container } = render(<KPICard label="New Leads" value="42" />)

    expect(screen.getByText('New Leads')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })
})

describe('KPICard loading state (Req 10.4)', () => {
  it('replaces the value with an announced loading placeholder while loading', () => {
    render(<KPICard label="Today's Revenue" value="₹12,499.00" loading />)

    // The value is suppressed in favour of the placeholder...
    expect(screen.queryByText('₹12,499.00')).not.toBeInTheDocument()
    // ...which is announced to assistive technology.
    expect(screen.getByText('Loading')).toBeInTheDocument()
    const busy = document.querySelector('[aria-busy="true"]')
    expect(busy).toBeInTheDocument()
    expect(busy).toHaveAttribute('aria-live', 'polite')
    // The label still renders alongside the loading placeholder.
    expect(screen.getByText("Today's Revenue")).toBeInTheDocument()
  })
})

describe('KPICard INR value rendering (Req 10.6)', () => {
  it('renders a caller-pre-formatted INR string verbatim (₹1,00,000.00)', () => {
    // The caller formats monetary paise via formatINRWithPaise; the card
    // renders the resulting string verbatim and performs no formatting.
    const value = formatINRWithPaise(10_000_000) // 1,00,000.00 rupees
    expect(value).toBe('₹1,00,000.00')

    render(<KPICard label="Monthly Revenue" value={value} />)

    expect(screen.getByText('₹1,00,000.00')).toBeInTheDocument()
  })

  it('renders Indian digit grouping with exactly two decimals', () => {
    const value = formatINRWithPaise(149_900) // ₹1,499.00
    expect(value).toBe('₹1,499.00')

    render(<KPICard label="Average Ticket" value={value} />)

    expect(screen.getByText('₹1,499.00')).toBeInTheDocument()
  })
})
