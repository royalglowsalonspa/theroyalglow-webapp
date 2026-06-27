/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : primitives (a11y test)
 * Scope        : Admin — Design-System Primitives accessibility
 *
 * Description  : Vitest + React Testing Library + jest-axe accessibility tests
 *                for the redesigned admin design-system primitives that did not
 *                already carry a zero-violations assertion: FilterBar, KPICard,
 *                ChartCard, SlideOverPanel, and the three state presenters
 *                (EmptyState, ErrorState, Skeleton). Each primitive is rendered
 *                with representative props and asserted to produce zero axe
 *                violations, complementing the existing per-primitive a11y
 *                coverage for Icon, StatusBadge, and DataTable.
 *
 * Responsibilities :
 * - Assert `axe(container).toHaveNoViolations()` for each covered primitive
 *   with representative props (Req 13.1)
 * - Exercise focusable controls so the focus-operability surface is audited
 *   (Req 13.2, 13.3)
 * - Cover the SlideOverPanel modal dialog (focus-constraining component) via
 *   its portal `baseElement` (Req 13.4)
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom,
 *                @radix-ui/react-dialog, recharts, lucide-react
 * Layer        : Testing (presentation primitives)
 *
 * Dependencies : @/components/ui/filter-bar, @/components/ui/kpi-card,
 *                @/components/ui/chart-card, @/components/ui/slide-over-panel,
 *                @/components/ui/state/*
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. jest-axe matchers
 *                are registered locally via expect.extend(toHaveNoViolations)
 *                so the wiring is idempotent and independent of src/test/setup.
 *                ResizeObserver / matchMedia are polyfilled in src/test/setup;
 *                Radix-portal components are audited via the render
 *                `baseElement` (document.body) because their content mounts
 *                outside the per-render container.
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 ************************************************************/

import { cleanup, render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { CalendarDays } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'

import { ChartCard, CHART_COLORS } from '@/components/ui/chart-card'
import {
  type ColumnToggle,
  FilterBar,
  type FilterBarProps,
} from '@/components/ui/filter-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

/* ============================================================================
 * FilterBar (Req 13.1, 13.3)
 * ========================================================================== */

describe('FilterBar accessibility (Req 13.1, 13.3)', () => {
  const config: FilterBarProps['config'] = {
    search: { placeholder: 'Search records', ariaLabel: 'Search records' },
    tabs: {
      ariaLabel: 'Booking type',
      options: [
        { value: 'all', label: 'All' },
        { value: 'salon', label: 'Salon' },
        { value: 'spa', label: 'Spa' },
      ],
    },
    dropdowns: [
      {
        id: 'status',
        label: 'Status filter',
        options: [
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'confirmed', label: 'Confirmed' },
        ],
      },
    ],
  }

  it('has zero violations with search, tabs, and a labelled dropdown', async () => {
    const { container } = render(<FilterBar config={config} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero violations rendering a column-visibility trigger', async () => {
    const columns: ColumnToggle[] = [
      { id: 'name', label: 'Name', visible: true },
      { id: 'phone', label: 'Phone', visible: true },
    ]

    const { container } = render(
      <FilterBar config={{ columnVisibility: true }} columns={columns} />,
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

/* ============================================================================
 * KPICard (Req 13.1)
 * ========================================================================== */

describe('KPICard accessibility (Req 13.1)', () => {
  it('has zero violations with a label, value, and decorative icon', async () => {
    const { container } = render(
      <KPICard label="Today's Revenue" value="₹1,00,000.00" icon={CalendarDays} />,
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero violations in the loading state', async () => {
    const { container } = render(
      <KPICard label="Today's Bookings" value="—" loading />,
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

/* ============================================================================
 * ChartCard (Req 13.1)
 * ========================================================================== */

describe('ChartCard accessibility (Req 13.1)', () => {
  it('has zero violations in the loading state', async () => {
    const { container } = render(<ChartCard title="Bookings" loading><div /></ChartCard>)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero violations hosting a recharts chart', async () => {
    const data = [
      { label: '01/06', count: 3 },
      { label: '02/06', count: 5 },
    ]
    const { container } = render(
      <ChartCard title="Bookings — last 7 days">
        <BarChart data={data}>
          <XAxis dataKey="label" />
          <YAxis />
          <Bar dataKey="count" name="Bookings" fill={CHART_COLORS.primary} />
        </BarChart>
      </ChartCard>,
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

/* ============================================================================
 * SlideOverPanel — focus-constraining modal dialog (Req 13.1, 13.4)
 * ========================================================================== */

describe('SlideOverPanel accessibility (Req 13.1, 13.4)', () => {
  it('has zero violations while open with a title, description, and footer', async () => {
    // Radix Dialog renders its content into a portal on document.body, so audit
    // the render baseElement (document.body) rather than the inline container.
    const { baseElement } = render(
      <SlideOverPanel
        open
        onOpenChange={() => {}}
        title="Booking BK-RS-2606-H-38291"
        description="Confirmed salon booking for Asha Rao"
        footer={
          <button type="button" className="px-3 py-2">
            Mark completed
          </button>
        }
      >
        <p>Signature Haircut — ₹800.00</p>
      </SlideOverPanel>,
    )

    const results = await axe(baseElement)
    expect(results).toHaveNoViolations()
  })
})

/* ============================================================================
 * State presenters (Req 13.1)
 * ========================================================================== */

describe('State presenters accessibility (Req 13.1)', () => {
  it('EmptyState has zero violations', async () => {
    const { container } = render(
      <EmptyState
        title="No bookings yet."
        message="New bookings will appear here as they come in."
        icon={CalendarDays}
      />,
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('ErrorState has zero violations with its retry control', async () => {
    const { container } = render(
      <ErrorState message="Could not load dashboard data." onRetry={() => {}} />,
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('Skeleton has zero violations for each variant', async () => {
    for (const variant of ['table', 'card', 'kpi'] as const) {
      const { container, unmount } = render(<Skeleton variant={variant} rows={3} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
      unmount()
    }
  })
})
