/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : data-table
 * Scope        : Admin — Data Table primitive
 *
 * Description  : Reusable, accessible Data_Table primitive for the admin design
 *                system, built on `@tanstack/react-table`. Renders caller-
 *                supplied columns + data with single-column sorting, optional
 *                row selection + select-all, expandable sub-rows, a kebab row-
 *                action menu, and a pagination footer. Column visibility is
 *                lifted so the FilterBar's column-visibility control can drive
 *                it. The table is wrapped in a horizontally scrollable region so
 *                only the table — never the page — scrolls on small viewports.
 *
 * Responsibilities :
 * - Wire caller columns/data to a TanStack table instance with the core,
 *   sorted, filtered, paginated, and expanded row models (Req 6.1, 6.2)
 * - Render sortable header buttons with asc/desc indicators, single active
 *   sort column (Req 6.3, 6.10)
 * - Apply row hover affordance and optional row-click handler (Req 6.4)
 * - Render a kebab row-action dropdown (Req 6.5)
 * - Render an optional selection checkbox column + header select-all (Req 6.6)
 * - Render an optional expand chevron column + sub-row content (Req 6.7)
 * - Render a pagination footer: rows-per-page {10,25,50,100} default 25,
 *   prev/next (disabled at bounds), "Page X of Y" (Req 6.8, 6.9, 6.11–6.13)
 * - Lift column visibility via props (Req 7.5)
 * - Provide an `overflow-x-auto` responsive region (Req 14.1)
 * - Use a `<table>` with `<caption class="sr-only">` + `<th scope>` (Req 6.10,
 *   13.3) and fully keyboard-operable controls
 *
 * Tech Stack   : React 19, TypeScript, @tanstack/react-table,
 *                @radix-ui/react-dropdown-menu, lucide-react, Tailwind CSS v4
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : @tanstack/react-table, @radix-ui/react-dropdown-menu,
 *                lucide-react, @/components/ui/icon, @/components/ui/data-table-model,
 *                @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                Tailwind-palette literals (Req 1.2). 'use client' required for
 *                the interactive table instance. Pure pagination / sort /
 *                column-visibility semantics are mirrored in the framework-free
 *                @/components/ui/data-table-model for property testing.
 *
 * Requirements : 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11,
 *                6.12, 6.13, 7.2, 7.3, 7.5, 14.1
 ************************************************************/

'use client'

import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSize } from '@/components/ui/data-table-model'
import { Icon } from '@/components/ui/icon'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@rgss/ui/lib/utils'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  type LucideIcon,
  MoreHorizontal,
} from 'lucide-react'
import { Fragment, useMemo, useRef, useState } from 'react'

/** Internal control-column ids, excluded from sorting / visibility toggling. */
const SELECT_COLUMN_ID = '__select'
const EXPAND_COLUMN_ID = '__expand'
const ACTIONS_COLUMN_ID = '__actions'

/**
 * A single row action rendered as an item in the kebab dropdown menu (Req 6.5).
 */
export type RowAction = {
  /** Visible, accessible label for the action. */
  label: string
  /** Optional leading `lucide-react` icon. */
  icon?: LucideIcon
  /** Invoked when the item is selected. */
  onSelect: () => void
  /** When true, the item is styled destructively (`text-error`). */
  destructive?: boolean
}

/**
 * Props for {@link DataTable}.
 */
export type DataTableProps<T> = {
  /** Caller-supplied column definitions (Req 6.2). */
  columns: ColumnDef<T, unknown>[]
  /** The rows to display. */
  data: T[]
  /** Stable route key for persisting column visibility within the route (Req 7.5). */
  tableId: string
  /** Render a leading selection checkbox column + header select-all (Req 6.6). */
  enableSelection?: boolean
  /** Predicate deciding whether a given row can expand (Req 6.7). */
  getRowCanExpand?: (row: Row<T>) => boolean
  /** Renders the expanded sub-row content for an expandable row (Req 6.7). */
  renderSubRows?: (row: Row<T>) => React.ReactNode
  /** Builds the kebab dropdown actions for a row (Req 6.5). */
  rowActions?: (row: Row<T>) => RowAction[]
  /** Invoked when a row body is activated (e.g. open a SlideOverPanel). */
  onRowClick?: (row: T) => void
  /** Initial rows per page; one of {10,25,50,100}, default 25 (Req 6.8). */
  pageSize?: PageSize
  /** Controlled global filter term from the FilterBar (Req 8). */
  globalFilter?: string
  /** Controlled per-column filters from the FilterBar (Req 8). */
  columnFilters?: ColumnFiltersState
  /** Lifted column-visibility state so the FilterBar can read it (Req 7.5). */
  columnVisibility?: VisibilityState
  /** Lifted column-visibility setter so the FilterBar can write it (Req 7.5). */
  onColumnVisibilityChange?: (visibility: VisibilityState) => void
  /** Accessible caption describing the table contents (rendered `sr-only`). */
  caption?: string
  /**
   * Server-driven pagination. When true, the supplied `data` is treated as a
   * single already-paginated page (no client-side row slicing); the caller
   * owns page navigation. Pair with {@link DataTableProps.hidePaginationFooter}
   * to suppress the built-in pager and drive pagination from a server pager.
   */
  manualPagination?: boolean
  /** Total page count for server-driven pagination (used when manual). */
  pageCount?: number
  /**
   * Suppress the built-in pagination footer (rows-per-page + prev/next + page
   * indicator). Used with {@link DataTableProps.manualPagination} so a single
   * server pager drives navigation without a redundant client pager.
   */
  hidePaginationFooter?: boolean
}

/**
 * Checkbox that supports the indeterminate visual state (used for select-all).
 * Native `<input type="checkbox">` so it is fully keyboard operable and exposes
 * a programmatic label for assistive technology (Req 6.6).
 */
function TableCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  // Indeterminate is a DOM-only property, not an attribute — sync via ref.
  if (ref.current) {
    ref.current.indeterminate = Boolean(indeterminate) && !checked
  }

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded-cards border-cloud-gray accent-deep-gold"
    />
  )
}

/**
 * Reusable, accessible data table built on `@tanstack/react-table`.
 *
 * Wires the core/sorted/filtered/paginated/expanded row models, single-column
 * sorting with header indicators, optional selection and expansion columns, a
 * kebab row-action menu, and a pagination footer. Column visibility is lifted
 * via {@link DataTableProps.columnVisibility} /
 * {@link DataTableProps.onColumnVisibilityChange}. The table is wrapped in an
 * `overflow-x-auto` region so only the table scrolls horizontally on small
 * viewports (Req 14.1).
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link DataTableProps}
 * @returns The rendered data table.
 */
export function DataTable<T>({
  columns,
  data,
  tableId,
  enableSelection = false,
  getRowCanExpand,
  renderSubRows,
  rowActions,
  onRowClick,
  pageSize = DEFAULT_PAGE_SIZE,
  globalFilter,
  columnFilters,
  columnVisibility: columnVisibilityProp,
  onColumnVisibilityChange,
  caption,
  manualPagination = false,
  pageCount,
  hidePaginationFooter = false,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>({})

  // Column visibility is controlled when a setter is supplied; otherwise it is
  // owned internally (Req 7.5).
  const columnVisibility = columnVisibilityProp ?? internalVisibility
  const handleVisibilityChange: OnChangeFn<VisibilityState> = (updater) => {
    const next = typeof updater === 'function' ? updater(columnVisibility) : updater
    if (onColumnVisibilityChange) {
      onColumnVisibilityChange(next)
    } else {
      setInternalVisibility(next)
    }
  }

  // Prepend selection / expand control columns and append the row-action
  // column around the caller's columns. Control columns opt out of sorting,
  // filtering, and visibility toggling.
  const augmentedColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    const result: ColumnDef<T, unknown>[] = []

    if (enableSelection) {
      result.push({
        id: SELECT_COLUMN_ID,
        enableSorting: false,
        enableHiding: false,
        size: 44,
        header: ({ table }) => (
          <TableCheckbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <TableCheckbox
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            label="Select row"
          />
        ),
      })
    }

    if (getRowCanExpand) {
      result.push({
        id: EXPAND_COLUMN_ID,
        enableSorting: false,
        enableHiding: false,
        size: 44,
        header: () => <span className="sr-only">Expand</span>,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <button
              type="button"
              aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
              aria-expanded={row.getIsExpanded()}
              onClick={(event) => {
                event.stopPropagation()
                row.toggleExpanded()
              }}
              className="flex h-7 w-7 items-center justify-center rounded-cards text-warm-gray transition-colors duration-150 hover:bg-cloud-gray motion-reduce:transition-none"
            >
              <Icon icon={row.getIsExpanded() ? ChevronDown : ChevronRight} decorative size={16} />
            </button>
          ) : null,
      })
    }

    result.push(...columns)

    if (rowActions) {
      result.push({
        id: ACTIONS_COLUMN_ID,
        enableSorting: false,
        enableHiding: false,
        size: 56,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const actions = rowActions(row)
          if (actions.length === 0) {
            return null
          }
          return (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="Row actions"
                  onClick={(event) => event.stopPropagation()}
                  className="flex h-8 w-8 items-center justify-center rounded-cards text-warm-gray transition-colors duration-150 hover:bg-cloud-gray data-[state=open]:bg-cloud-gray motion-reduce:transition-none"
                >
                  <Icon icon={MoreHorizontal} decorative />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-[10rem] overflow-hidden rounded-cards border border-cloud-gray bg-canvas-white py-1 shadow-lg"
                >
                  {actions.map((action) => (
                    <DropdownMenu.Item
                      key={action.label}
                      onSelect={() => action.onSelect()}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 px-3 py-1.5 font-ui text-sm outline-none',
                        'data-[highlighted]:bg-cloud-gray',
                        action.destructive ? 'text-error' : 'text-cocoa-dark',
                      )}
                    >
                      {action.icon ? <Icon icon={action.icon} decorative size={15} /> : null}
                      {action.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )
        },
      })
    }

    return result
  }, [columns, enableSelection, getRowCanExpand, rowActions])

  const table = useReactTable<T>({
    data,
    columns: augmentedColumns,
    state: {
      sorting,
      rowSelection,
      expanded,
      pagination,
      columnVisibility,
      ...(globalFilter !== undefined ? { globalFilter } : {}),
      ...(columnFilters !== undefined ? { columnFilters } : {}),
    },
    enableMultiSort: false,
    enableRowSelection: enableSelection,
    manualPagination,
    ...(pageCount !== undefined ? { pageCount } : {}),
    ...(getRowCanExpand ? { getRowCanExpand } : {}),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: handleVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  const visibleColumnCount = table.getVisibleLeafColumns().length
  const resolvedPageCount = Math.max(1, table.getPageCount())
  const currentPage = table.getState().pagination.pageIndex + 1
  const rows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-3">
      {/* Responsive region: only the table scrolls horizontally (Req 14.1). */}
      <div
        data-testid="data-table-scroll"
        className="overflow-x-auto rounded-cards border border-cloud-gray"
      >
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption ?? `Data table ${tableId}`}</caption>

          <thead className="border-b border-cloud-gray bg-cloud-gray/30">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  const indicator = !sortDir
                    ? ChevronsUpDown
                    : sortDir === 'asc'
                      ? ChevronUp
                      : ChevronDown

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sortDir === 'asc'
                          ? 'ascending'
                          : sortDir === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className="whitespace-nowrap px-3 py-2.5 font-ui text-xs font-semibold uppercase tracking-wide text-warm-gray"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded-cards font-ui text-xs font-semibold uppercase tracking-wide text-warm-gray transition-colors duration-150 hover:text-cocoa-dark motion-reduce:transition-none"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <Icon
                            icon={indicator}
                            decorative
                            size={14}
                            className={sortDir ? 'text-deep-gold' : 'text-dusty-gray'}
                          />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnCount}
                  className="px-3 py-8 text-center font-sans text-sm text-warm-gray"
                >
                  No results
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const clickable = Boolean(onRowClick)
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={cn(
                        'border-b border-cloud-gray transition-colors duration-150 hover:bg-cloud-gray/40 motion-reduce:transition-none',
                        clickable && 'cursor-pointer',
                        row.getIsSelected() && 'bg-cloud-gray/40',
                      )}
                      {...(clickable
                        ? {
                            role: 'button',
                            tabIndex: 0,
                            onClick: () => onRowClick?.(row.original),
                            onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                onRowClick?.(row.original)
                              }
                            },
                          }
                        : {})}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="whitespace-nowrap px-3 py-2.5 font-sans text-sm text-cocoa-dark"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>

                    {row.getIsExpanded() && renderSubRows ? (
                      <tr className="border-b border-cloud-gray bg-cloud-gray/20">
                        <td colSpan={visibleColumnCount} className="px-3 py-3">
                          {renderSubRows(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer (Req 6.8, 6.9, 6.11–6.13). Suppressed when a server
          pager drives navigation (hidePaginationFooter). */}
      {hidePaginationFooter ? null : (
        <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label
              htmlFor={`${tableId}-page-size`}
              className="font-ui text-xs font-medium text-warm-gray"
            >
              Rows per page
            </label>
            <select
              id={`${tableId}-page-size`}
              value={table.getState().pagination.pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              className="rounded-cards border border-cloud-gray bg-canvas-white px-2 py-1 font-ui text-sm text-cocoa-dark"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-ui text-xs font-medium text-warm-gray" aria-live="polite">
              Page {currentPage} of {resolvedPageCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-cards border border-cloud-gray text-warm-gray transition-colors duration-150 hover:bg-cloud-gray disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              >
                <Icon icon={ChevronUp} decorative size={16} className="-rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-cards border border-cloud-gray text-warm-gray transition-colors duration-150 hover:bg-cloud-gray disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              >
                <Icon icon={ChevronDown} decorative size={16} className="-rotate-90" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
