/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ChartCard (component test)
 * Scope        : Admin — Dashboard Chart Card primitive
 *
 * Description  : Component tests for the presentation-only ChartCard primitive.
 *                Verifies it renders the supplied title (card chrome) and hosts
 *                the supplied recharts chart child, and that while `loading` the
 *                chart area is replaced by an announced loading placeholder.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, recharts
 * Layer        : Testing (Presentation / Component)
 *
 * Dependencies : @/components/ui/chart-card, recharts
 *
 * Notes        :
 * - Validates: Requirements 10.2
 * - recharts' ResponsiveContainer measures its host element via ResizeObserver
 *   and renders nothing until it reports non-zero dimensions. jsdom reports a
 *   0x0 box, so the real container would never reveal its child. Following the
 *   task guidance, ResponsiveContainer is mocked to a pass-through wrapper so
 *   the test asserts the ChartCard chrome (title) + the presence of the hosted
 *   chart child rather than a rendered SVG.
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock ONLY ResponsiveContainer to a pass-through wrapper; jsdom's 0x0 layout
// otherwise suppresses the chart child entirely. Other recharts exports are
// preserved in case the hosted chart uses them.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  }
})

import { ChartCard } from '@/components/ui/chart-card'

afterEach(cleanup)

describe('ChartCard rendering (Req 10.2)', () => {
  it('renders the title and hosts the chart child inside the responsive container', () => {
    render(
      <ChartCard title="Bookings (last 7 days)">
        <div data-testid="chart">bar chart</div>
      </ChartCard>,
    )

    // Card chrome: the heading is exposed as a level-3 heading.
    expect(
      screen.getByRole('heading', { name: 'Bookings (last 7 days)', level: 3 }),
    ).toBeInTheDocument()

    // The chart child is hosted inside the ResponsiveContainer wrapper.
    const container = screen.getByTestId('responsive-container')
    const chart = screen.getByTestId('chart')
    expect(chart).toBeInTheDocument()
    expect(container).toContainElement(chart)
  })
})

describe('ChartCard loading state (Req 10.4)', () => {
  it('replaces the chart with an announced loading placeholder while loading', () => {
    render(
      <ChartCard title="Bookings (last 7 days)" loading>
        <div data-testid="chart">bar chart</div>
      </ChartCard>,
    )

    // The chart (and its responsive host) is suppressed in favour of the
    // placeholder...
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()

    // ...which is announced to assistive technology.
    expect(screen.getByText('Loading chart')).toBeInTheDocument()
    const busy = document.querySelector('[aria-busy="true"]')
    expect(busy).toBeInTheDocument()
    expect(busy).toHaveAttribute('aria-live', 'polite')

    // The title still renders alongside the loading placeholder.
    expect(
      screen.getByRole('heading', { name: 'Bookings (last 7 days)', level: 3 }),
    ).toBeInTheDocument()
  })
})
