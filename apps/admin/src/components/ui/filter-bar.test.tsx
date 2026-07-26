/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : filter-bar.test
 * Scope        : Component tests for FilterBar control interactions
 *
 * Description  : Vitest + @testing-library/react component tests exercising the
 *                FilterBar primitive's interactive behaviour from the user's
 *                point of view:
 *                  - the search input is capped at 100 characters and emits the
 *                    trimmed term exactly once after the 300 ms debounce
 *                    (fake timers) (Req 8.2, 8.3)
 *                  - selecting a filter dropdown option emits (id, value)
 *                    (Req 8.4)
 *                  - clicking a tab emits the tab value (Req 8.5)
 *                  - opening the column-visibility menu and toggling a column
 *                    emits (id, visible) and reflects within the table's
 *                    200 ms budget (Req 7.2, 7.3, 8.6)
 *
 * Notes        : Distinct from the property tests
 *                (filter-bar-render.property.test.ts /
 *                filter-bar-search.property.test.ts). Presentation-layer test
 *                only — the component is consumed as-is and no production code
 *                changes. @testing-library/user-event is not installed in the
 *                admin workspace, so Radix dropdown interactions are driven with
 *                fireEvent. Runs under the admin jsdom project.
 *
 * Requirements : 7.2, 7.3, 8.3, 8.4, 8.5, 8.6
 ************************************************************/

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  type ColumnToggle,
  FilterBar,
  type FilterBarProps,
  SEARCH_MAX_LENGTH,
} from '@/components/ui/filter-bar'

/* ----------------------------------------------------------------------------
 * jsdom polyfills — Radix DropdownMenu (via @radix-ui/react-popper) relies on
 * APIs jsdom does not implement. Provide inert stand-ins so the column-
 * visibility menu can open during tests.
 * -------------------------------------------------------------------------- */

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  if (typeof window.PointerEvent === 'undefined') {
    window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent
  }
})

afterEach(() => {
  cleanup()
})

/* ============================================================================
 * Search input — maxLength + debounce timing (Req 8.2, 8.3)
 * ========================================================================== */

describe('FilterBar search input (Req 8.2, 8.3)', () => {
  const SEARCH_CONFIG: FilterBarProps['config'] = {
    search: { placeholder: 'Search records', ariaLabel: 'Search records' },
  }

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('caps the search input at 100 characters (Req 8.3)', () => {
    render(<FilterBar config={SEARCH_CONFIG} />)

    const input = screen.getByLabelText('Search records') as HTMLInputElement

    expect(input).toHaveAttribute('maxlength', String(SEARCH_MAX_LENGTH))
    expect(input.maxLength).toBe(SEARCH_MAX_LENGTH)
    expect(SEARCH_MAX_LENGTH).toBe(100)
  })

  it('emits the trimmed term exactly once after the 300 ms debounce elapses (Req 8.2)', () => {
    vi.useFakeTimers()
    const onSearchChange = vi.fn<(trimmed: string) => void>()

    render(<FilterBar config={SEARCH_CONFIG} onSearchChange={onSearchChange} />)

    const input = screen.getByLabelText('Search records') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  glow facial  ' } })

    // Before the debounce window closes, nothing is emitted.
    vi.advanceTimersByTime(299)
    expect(onSearchChange).not.toHaveBeenCalled()

    // Crossing the 300 ms boundary emits the trimmed term exactly once.
    vi.advanceTimersByTime(1)
    expect(onSearchChange).toHaveBeenCalledTimes(1)
    expect(onSearchChange).toHaveBeenCalledWith('glow facial')
  })

  it('coalesces a burst of keystrokes into a single trailing emit of the final term (Req 8.2)', () => {
    vi.useFakeTimers()
    const onSearchChange = vi.fn<(trimmed: string) => void>()

    render(<FilterBar config={SEARCH_CONFIG} onSearchChange={onSearchChange} />)

    const input = screen.getByLabelText('Search records') as HTMLInputElement

    // Three keystrokes inside one debounce window — the timer resets each time.
    fireEvent.change(input, { target: { value: 'g' } })
    vi.advanceTimersByTime(100)
    fireEvent.change(input, { target: { value: 'gl' } })
    vi.advanceTimersByTime(100)
    fireEvent.change(input, { target: { value: '  glow  ' } })

    // Only after 300 ms of quiet does a single emit fire with the last value.
    expect(onSearchChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(onSearchChange).toHaveBeenCalledTimes(1)
    expect(onSearchChange).toHaveBeenCalledWith('glow')
  })
})

/* ============================================================================
 * Filter dropdown — selection emit (Req 8.4)
 * ========================================================================== */

describe('FilterBar filter dropdown (Req 8.4)', () => {
  it('emits onFilterChange(id, value) when an option is selected', async () => {
    const onFilterChange = vi.fn<(id: string, value: string) => void>()
    const config: FilterBarProps['config'] = {
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

    render(<FilterBar config={config} onFilterChange={onFilterChange} />)

    // Open the shadcn Select (Radix opens on Enter), then pick an option.
    const trigger = screen.getByLabelText('Status filter')
    fireEvent.keyDown(trigger, { key: 'Enter' })

    const option = await screen.findByRole('option', { name: 'Confirmed' })
    fireEvent.click(option)

    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(onFilterChange).toHaveBeenCalledWith('status', 'confirmed')
  })
})

/* ============================================================================
 * Tabbed filter — selection emit (Req 8.5)
 * ========================================================================== */

describe('FilterBar tabbed filter (Req 8.5)', () => {
  it('emits onTabChange(value) when a tab is clicked', () => {
    const onTabChange = vi.fn<(value: string) => void>()
    const config: FilterBarProps['config'] = {
      tabs: {
        ariaLabel: 'Booking type',
        options: [
          { value: 'all', label: 'All' },
          { value: 'salon', label: 'Salon' },
          { value: 'spa', label: 'Spa' },
        ],
      },
    }

    render(<FilterBar config={config} onTabChange={onTabChange} />)

    const tablist = screen.getByRole('tablist', { name: 'Booking type' })
    const spaTab = within(tablist).getByRole('tab', { name: 'Spa' })
    fireEvent.click(spaTab)

    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('spa')
    expect(spaTab).toHaveAttribute('aria-selected', 'true')
  })
})

/* ============================================================================
 * Column-visibility — open menu + toggle within budget (Req 7.2, 7.3, 8.6)
 * ========================================================================== */

describe('FilterBar column-visibility control (Req 7.2, 7.3, 8.6)', () => {
  // The Data_Table must apply a visibility change within 200 ms (Req 7.2/7.3).
  // The FilterBar emit is synchronous, so we assert it lands well inside that
  // budget once the menu is open.
  const COLUMN_CHANGE_BUDGET_MS = 200

  const columns: ColumnToggle[] = [
    { id: 'name', label: 'Name', visible: true },
    { id: 'phone', label: 'Phone', visible: true },
    { id: 'email', label: 'Email', visible: false },
  ]

  it('opens the Columns menu and emits onColumnToggle(id, false) when hiding a visible column, within budget', async () => {
    const onColumnToggle = vi.fn<(id: string, visible: boolean) => void>()

    render(
      <FilterBar
        config={{ columnVisibility: true }}
        columns={columns}
        onColumnToggle={onColumnToggle}
      />,
    )

    // Open the menu via keyboard activation (Radix opens on Enter).
    const trigger = screen.getByRole('button', { name: 'Toggle column visibility' })
    fireEvent.keyDown(trigger, { key: 'Enter' })

    // The toggle list renders each toggleable column as a checkbox item.
    const phoneItem = await screen.findByRole('menuitemcheckbox', { name: 'Phone' })
    expect(phoneItem).toHaveAttribute('aria-checked', 'true')

    const start = performance.now()
    fireEvent.click(phoneItem)
    const elapsed = performance.now() - start

    expect(onColumnToggle).toHaveBeenCalledTimes(1)
    expect(onColumnToggle).toHaveBeenCalledWith('phone', false)
    expect(elapsed).toBeLessThan(COLUMN_CHANGE_BUDGET_MS)
  })

  it('emits onColumnToggle(id, true) when showing a hidden column (Req 7.3, 8.6)', async () => {
    const onColumnToggle = vi.fn<(id: string, visible: boolean) => void>()

    render(
      <FilterBar
        config={{ columnVisibility: true }}
        columns={columns}
        onColumnToggle={onColumnToggle}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle column visibility' })
    fireEvent.keyDown(trigger, { key: 'Enter' })

    const emailItem = await screen.findByRole('menuitemcheckbox', { name: 'Email' })
    expect(emailItem).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(emailItem)

    expect(onColumnToggle).toHaveBeenCalledTimes(1)
    expect(onColumnToggle).toHaveBeenCalledWith('email', true)
  })

  it('does not emit and surfaces a hint when hiding the last visible column (Req 7.4 guard)', async () => {
    const onColumnToggle = vi.fn<(id: string, visible: boolean) => void>()
    const single: ColumnToggle[] = [{ id: 'name', label: 'Name', visible: true }]

    render(
      <FilterBar
        config={{ columnVisibility: true }}
        columns={single}
        onColumnToggle={onColumnToggle}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle column visibility' })
    fireEvent.keyDown(trigger, { key: 'Enter' })

    const nameItem = await screen.findByRole('menuitemcheckbox', { name: 'Name' })
    fireEvent.click(nameItem)

    expect(onColumnToggle).not.toHaveBeenCalled()
    expect(await screen.findByText('At least one column must stay visible')).toBeInTheDocument()
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})
