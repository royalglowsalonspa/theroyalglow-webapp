/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : DataTable (component test)
 * Scope        : Admin — Data Table primitive
 *
 * Description  : Component tests for the reusable DataTable primitive. Verifies
 *                inline row actions, row selection + select-all, expandable
 *                sub-rows, header/cell associations for assistive technology,
 *                and keyboard operability of the interactive controls.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, jest-axe
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - Validates: Requirements 6.5, 6.6, 6.7, 6.10
 * - `@testing-library/user-event` is not installed in the admin app, so
 *   interactions use `fireEvent`. Native controls (`<button>`, `<input>`,
 *   `<select>`) are inherently keyboard-operable, which the structural
 *   assertions confirm.
 * - Radix's DropdownMenu relies on a few DOM APIs jsdom does not implement
 *   (pointer capture, scrollIntoView, ResizeObserver); these are stubbed below.
 ************************************************************/

import type { ColumnDef, Row } from '@tanstack/react-table'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Pencil, Trash2 } from 'lucide-react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { DataTable, type RowAction } from './data-table'

// jest-axe registers a custom matcher at runtime via `expect.extend`. Vitest's
// `Assertion` interface cannot be cleanly augmented here (its type parameters
// differ), so the matcher is reached through a narrow typed view of `expect`.
expect.extend(toHaveNoViolations)
type AxeMatcher = { toHaveNoViolations(): void }

type Person = { id: string; name: string; role: string }

const PEOPLE: Person[] = [
  { id: '1', name: 'Asha Rao', role: 'Stylist' },
  { id: '2', name: 'Bina Shah', role: 'Therapist' },
  { id: '3', name: 'Chetan Kumar', role: 'Manager' },
]

const COLUMNS: ColumnDef<Person, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' },
]

// Radix DropdownMenu touches DOM APIs jsdom omits. Stub them so the menu can
// open in the test environment.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DataTable inline row actions (Req 6.5)', () => {
  it('renders a "Row actions" kebab trigger for every row', () => {
    const rowActions = (_row: Row<Person>): RowAction[] => [
      { label: 'Edit', icon: Pencil, onSelect: () => {} },
    ]

    render(
      <DataTable<Person>
        columns={COLUMNS}
        data={PEOPLE}
        tableId="people"
        rowActions={rowActions}
      />,
    )

    const triggers = screen.getAllByRole('button', { name: 'Row actions' })
    expect(triggers).toHaveLength(PEOPLE.length)
  })

  it('reveals the action items when a kebab trigger is opened and invokes onSelect', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const rowActions = (_row: Row<Person>): RowAction[] => [
      { label: 'Edit', icon: Pencil, onSelect: onEdit },
      { label: 'Delete', icon: Trash2, onSelect: onDelete, destructive: true },
    ]

    render(
      <DataTable<Person>
        columns={COLUMNS}
        data={PEOPLE}
        tableId="people"
        rowActions={rowActions}
      />,
    )

    const [trigger] = screen.getAllByRole('button', { name: 'Row actions' })
    if (!trigger) {
      throw new Error('expected at least one row-action trigger')
    }
    // Keyboard activation (Enter) opens the menu — also exercises keyboard
    // operability of the row-action control (Req 6.10).
    fireEvent.keyDown(trigger, { key: 'Enter' })

    const edit = screen.getByRole('menuitem', { name: 'Edit' })
    const remove = screen.getByRole('menuitem', { name: 'Delete' })
    expect(edit).toBeInTheDocument()
    expect(remove).toBeInTheDocument()

    fireEvent.click(edit)
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
  })
})

describe('DataTable row selection (Req 6.6)', () => {
  it('renders a select-all header checkbox and a per-row checkbox', () => {
    render(<DataTable<Person> columns={COLUMNS} data={PEOPLE} tableId="people" enableSelection />)

    expect(screen.getByLabelText('Select all rows')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Select row')).toHaveLength(PEOPLE.length)
  })

  it('selects every row when the select-all checkbox is toggled', () => {
    render(<DataTable<Person> columns={COLUMNS} data={PEOPLE} tableId="people" enableSelection />)

    const selectAll = screen.getByLabelText('Select all rows') as HTMLInputElement
    expect(selectAll.checked).toBe(false)

    fireEvent.click(selectAll)

    expect(selectAll.checked).toBe(true)
    for (const box of screen.getAllByLabelText('Select row') as HTMLInputElement[]) {
      expect(box.checked).toBe(true)
    }
  })
})

describe('DataTable row expansion (Req 6.7)', () => {
  it('renders an expand control that reveals sub-row content when activated', () => {
    render(
      <DataTable<Person>
        columns={COLUMNS}
        data={PEOPLE}
        tableId="people"
        getRowCanExpand={() => true}
        renderSubRows={(row) => <div data-testid="sub-row">Details for {row.original.name}</div>}
      />,
    )

    // Collapsed initially: no sub-row content yet.
    expect(screen.queryByTestId('sub-row')).not.toBeInTheDocument()

    const expandControls = screen.getAllByRole('button', { name: 'Expand row' })
    expect(expandControls).toHaveLength(PEOPLE.length)

    const [firstExpand] = expandControls
    if (!firstExpand) {
      throw new Error('expected at least one expand control')
    }
    fireEvent.click(firstExpand)

    // Sub-row content appears and the control flips to a collapse affordance.
    expect(screen.getByTestId('sub-row')).toHaveTextContent('Details for Asha Rao')
    expect(screen.getByRole('button', { name: 'Collapse row' })).toBeInTheDocument()
  })
})

describe('DataTable accessibility + keyboard operability (Req 6.10)', () => {
  it('associates headers with cells via <th scope="col"> and an sr-only caption', () => {
    const { container } = render(
      <DataTable<Person> columns={COLUMNS} data={PEOPLE} tableId="people" caption="Team members" />,
    )

    const headerCells = container.querySelectorAll('thead th')
    expect(headerCells.length).toBeGreaterThan(0)
    for (const th of headerCells) {
      expect(th).toHaveAttribute('scope', 'col')
    }

    const caption = container.querySelector('caption')
    expect(caption).toHaveTextContent('Team members')
    expect(caption).toHaveClass('sr-only')
  })

  it('renders a sortable header as a <button> and toggles aria-sort on activation', () => {
    const { container } = render(
      <DataTable<Person> columns={COLUMNS} data={PEOPLE} tableId="people" />,
    )

    const nameHeaderButton = screen.getByRole('button', { name: /name/i })
    expect(nameHeaderButton.tagName).toBe('BUTTON')

    const nameTh = container.querySelector('thead th') as HTMLTableCellElement
    expect(nameTh).not.toHaveAttribute('aria-sort')

    fireEvent.click(nameHeaderButton)
    expect(nameTh).toHaveAttribute('aria-sort', 'ascending')

    fireEvent.click(nameHeaderButton)
    expect(nameTh).toHaveAttribute('aria-sort', 'descending')
  })

  it('exposes pagination controls as native, keyboard-operable buttons and a select', () => {
    render(<DataTable<Person> columns={COLUMNS} data={PEOPLE} tableId="people" />)

    const prev = screen.getByRole('button', { name: 'Previous page' })
    const next = screen.getByRole('button', { name: 'Next page' })
    expect(prev.tagName).toBe('BUTTON')
    expect(next.tagName).toBe('BUTTON')

    const pageSize = screen.getByLabelText('Rows per page')
    expect(pageSize.tagName).toBe('SELECT')
  })

  it('has no detectable accessibility violations with selection, expansion, and actions enabled', async () => {
    const rowActions = (_row: Row<Person>): RowAction[] => [
      { label: 'Edit', icon: Pencil, onSelect: () => {} },
    ]

    const { container } = render(
      <DataTable<Person>
        columns={COLUMNS}
        data={PEOPLE}
        tableId="people"
        caption="Team members"
        enableSelection
        getRowCanExpand={() => true}
        renderSubRows={(row) => <div>Details for {row.original.name}</div>}
        rowActions={rowActions}
      />,
    )

    const results = await axe(container)
    ;(expect(results) as unknown as AxeMatcher).toHaveNoViolations()
  })
})
