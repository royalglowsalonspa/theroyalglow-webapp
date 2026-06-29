/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : data-table
 * Scope        : Admin — Data Table primitive
 *
 * Description  : Reusable, accessible Data_Table primitive composing the
 *                owned-source shadcn `Table` / `Checkbox` / `DropdownMenu` /
 *                `Select` / `Button` components, driven by
 *                `@tanstack/react-table`. Renders caller-supplied columns + data
 *                with single-column sorting, optional row selection + select-all,
 *                expandable sub-rows, a kebab row-action menu, and a pagination
 *                footer. Column visibility is lifted so the FilterBar's
 *                column-visibility control can drive it. The table is wrapped in
 *                a horizontally scrollable region (`data-table-scroll`) so only
 *                the table — never the page — scrolls on small viewports.
 *
 * Responsibilities :
 * - Wire caller columns/data to a TanStack table instance (core/sorted/
 *   filtered/paginated/expanded models)
 * - Render sortable shadcn TableHead buttons with asc/desc indicators
 * - Apply row hover affordance and optional row-click handler
 * - Render a shadcn kebab DropdownMenu of row actions
 * - Render an optional shadcn Checkbox selection column + header select-all
 * - Render an optional expand chevron column + sub-row content
 * - Render a pagination footer: shadcn Select rows-per-page {10,25,50,100}
 *   default 25, shadcn Button prev/next (disabled at bounds), "Page X of Y"
 * - Lift column visibility via props
 * - Provide an `overflow-x-auto` responsive region (Req 19.1)
 * - Use a `<table>` with `<caption class="sr-only">` + `<th scope>` and fully
 *   keyboard-operable controls
 *
 * Tech Stack   : React 19, TypeScript, @tanstack/react-table, shadcn (Table,
 *                Checkbox, DropdownMenu, Select, Button), lucide-react,
 *                Tailwind CSS v4
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : @tanstack/react-table, @/components/ui/{table,checkbox,
 *                dropdown-menu,select,button,icon}, @/components/ui/data-table-model,
 *                @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                Tailwind-palette literals (Req 1.2). 'use client' required for
 *                the interactive table instance. Pure pagination / sort /
 *                column-visibility semantics are mirrored (and property-tested)
 *                in the framework-free @/components/ui/data-table-model, which
 *                is preserved unchanged.
 ************************************************************/

'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSize } from '@/components/ui/data-table-model'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Fragment, useMemo, useState } from 'react'

/** Internal control-column ids, excluded from sorting / visibility toggling. */
const SELECT_COLUMN_ID = '__select'
const EXPAND_COLUMN_ID = '__expand'
const ACTIONS_COLUMN_ID = '__actions'

/**
 * A single row action rendered as an item in the kebab dropdown menu.
 */
export type RowAction = {
  /** Visible, accessible label for the action. */
  label: string
  /** Optional leading `lucide-react` icon. */
  icon?: LucideIcon
  /** Invoked when the item is selected. */
  onSelect: () => void
  /** When true, the item is styled destructively. */
  destructive?: boolean
}

/**
 * Props for {@link DataTable}.
 */
export type DataTableProps<T> = {
  /** Caller-supplied column definitions. */
  columns: ColumnDef<T, unknown>[]
  /** The rows to display. */
  data: T[]
  /** Stable route key for persisting column visibility within the route. */
  tableId: string
  /** Render a leading selection checkbox column + header select-all. */
  enableSelection?: boolean
  /** Predicate deciding whether a given row can expand. */
  getRowCanExpand?: (row: Row<T>) => boolean
  /** Renders the expanded sub-row content for an expandable row. */
  renderSubRows?: (row: Row<T>) => React.ReactNode
  /** Builds the kebab dropdown actions for a row. */
  rowActions?: (row: Row<T>) => RowAction[]
  /** Invoked when a row body is activated (e.g. open a DetailSheet). */
  onRowClick?: (row: T) => void
  /** Initial rows per page; one of {10,25,50,100}, default 25. */
  pageSize?: PageSize
  /** Controlled global filter term from the FilterBar. */
  globalFilter?: string
  /** Controlled per-column filters from the FilterBar. */
  columnFilters?: ColumnFiltersState
  /** Lifted column-visibility state so the FilterBar can read it. */
  columnVisibility?: VisibilityState
  /** Lifted column-visibility setter so the FilterBar can write it. */
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
 * Reusable, accessible data table built on `@tanstack/react-table` and the
 * owned-source shadcn primitives. Presentation-only: no I/O, no business logic.
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
  // owned internally.
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
          <Checkbox
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
            onClick={(event) => event.stopPropagation()}
            aria-label="Select row"
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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
              aria-expanded={row.getIsExpanded()}
              onClick={(event) => {
                event.stopPropagation()
                row.toggleExpanded()
              }}
              className="text-warm-gray"
            >
              <Icon icon={row.getIsExpanded() ? ChevronDown : ChevronRight} decorative size={16} />
            </Button>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Row actions"
                  onClick={(event) => event.stopPropagation()}
                  className="text-warm-gray"
                >
                  <Icon icon={MoreHorizontal} decorative />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-[10rem]">
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    variant={action.destructive ? 'destructive' : 'default'}
                    onSelect={() => action.onSelect()}
                    className="gap-2 font-ui"
                  >
                    {action.icon ? <Icon icon={action.icon} decorative size={15} /> : null}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
      {/* Responsive region: only the table scrolls horizontally (Req 19.1). */}
      <div
        data-testid="data-table-scroll"
        className="overflow-x-auto rounded-cards border border-cloud-gray"
      >
        <table className="w-full caption-bottom border-collapse text-left text-sm">
          <caption className="sr-only">{caption ?? `Data table ${tableId}`}</caption>

          <TableHeader className="bg-cloud-gray/30">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  const indicator = !sortDir
                    ? ChevronsUpDown
                    : sortDir === 'asc'
                      ? ChevronUp
                      : ChevronDown

                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sortDir === 'asc'
                          ? 'ascending'
                          : sortDir === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className="px-3 py-2.5 font-ui text-xs font-semibold uppercase tracking-wide text-warm-gray"
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
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={visibleColumnCount}
                  className="px-3 py-8 text-center font-sans text-sm text-warm-gray"
                >
                  No results
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const clickable = Boolean(onRowClick)
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() ? 'selected' : undefined}
                      className={cn(clickable && 'cursor-pointer')}
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
                        <TableCell
                          key={cell.id}
                          className="px-3 py-2.5 font-sans text-sm text-cocoa-dark"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>

                    {row.getIsExpanded() && renderSubRows ? (
                      <TableRow className="bg-cloud-gray/20 hover:bg-cloud-gray/20">
                        <TableCell colSpan={visibleColumnCount} className="px-3 py-3">
                          {renderSubRows(row)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </table>
      </div>

      {/* Pagination footer. Suppressed when a server pager drives navigation. */}
      {hidePaginationFooter ? null : (
        <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span id={`${tableId}-page-size-label`} className="font-ui text-xs font-medium text-warm-gray">
              Rows per page
            </span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger
                size="sm"
                aria-labelledby={`${tableId}-page-size-label`}
                className="w-[4.5rem] font-ui"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-ui text-xs font-medium text-warm-gray" aria-live="polite">
              Page {currentPage} of {resolvedPageCount}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
              >
                <Icon icon={ChevronUp} decorative size={16} className="-rotate-90" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
              >
                <Icon icon={ChevronDown} decorative size={16} className="-rotate-90" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
