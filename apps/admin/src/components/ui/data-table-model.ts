/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : data-table-model
 * Scope        : Admin — Data Table primitive (pure model)
 *
 * Description  : Pure, framework-free model that mirrors the TanStack-driven
 *                DataTable behaviour so it can be reasoned about and property-
 *                tested in isolation. Contains three independent concerns:
 *                pagination (index/slice + prev/next control state), single-
 *                column sorting (asc/desc toggle + comparator), and a column-
 *                visibility reducer guarding the never-empty invariant.
 *
 * Responsibilities :
 * - Compute total page count and clamp a page into [1, totalPages]
 * - Derive the contiguous row slice and prev/next disabled control state
 * - Toggle a single active sort column between ascending and descending
 * - Order rows monotonically by the active sort column
 * - Toggle column visibility while never hiding the last visible data column
 *
 * Features / Functionality :
 * - PAGE_SIZES / DEFAULT_PAGE_SIZE — allowed page sizes (default 25)
 * - totalPageCount / clampPage / getPaginationState / pageSlice / nextPage /
 *   prevPage — pagination model (Req 6.8, 6.9, 6.11, 6.12, 6.13)
 * - SortState / toggleSort / defaultComparator / sortRows — single-column sort
 *   with asc⇄desc toggling (Req 6.3)
 * - isColumnVisible / visibleToggleableColumns / toggleColumnVisibility —
 *   column-visibility reducer with last-visible-column guard (Req 7.4, 7.5)
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure model, no React, no I/O, no business logic)
 *
 * Notes        : This module is intentionally free of React and TanStack
 *                imports so it is fully deterministic and property-testable.
 *                The DataTable component (task 6.5) wires these semantics to the
 *                `@tanstack/react-table` instance. Confined to
 *                apps/admin/src/components/ui/.
 *
 * Requirements : 6.3, 6.8, 6.9, 6.11, 6.12, 6.13, 7.4, 7.5
 ************************************************************/

/* ============================================================================
 * Pagination (Req 6.8, 6.9, 6.11, 6.12, 6.13)
 * ========================================================================== */

/** The page-size options offered by the "Rows per page" control (Req 6.8). */
export type PageSize = 10 | 25 | 50 | 100

/** Ordered list of allowed page sizes (Req 6.8). */
export const PAGE_SIZES: readonly PageSize[] = [10, 25, 50, 100]

/** Default page size selected on first render (Req 6.8). */
export const DEFAULT_PAGE_SIZE: PageSize = 25

/**
 * Normalise an arbitrary row count to a non-negative integer. Non-finite or
 * negative inputs are treated as `0`.
 */
function normaliseTotal(totalRows: number): number {
  if (!Number.isFinite(totalRows)) {
    return 0
  }
  return Math.max(0, Math.floor(totalRows))
}

/**
 * Normalise an arbitrary page size to a positive integer. Non-finite or
 * non-positive inputs are treated as `1` so division is always well-defined.
 */
function normalisePageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize)) {
    return 1
  }
  return Math.max(1, Math.floor(pageSize))
}

/**
 * Total number of pages for `totalRows` rows at `pageSize` rows per page.
 *
 * Always at least `1` (an empty table still has a single, empty page), and
 * equals `ceil(totalRows / pageSize)` otherwise (Req 6.11).
 *
 * Pure function: no I/O, no side effects.
 */
export function totalPageCount(totalRows: number, pageSize: number): number {
  const total = normaliseTotal(totalRows)
  const size = normalisePageSize(pageSize)
  return Math.max(1, Math.ceil(total / size))
}

/**
 * Clamp a requested 1-based page number into the valid range
 * `[1, totalPageCount(totalRows, pageSize)]` (Req 6.13). Non-integer or
 * non-finite requests fall back to page `1`.
 *
 * Pure function: no I/O, no side effects.
 */
export function clampPage(page: number, totalRows: number, pageSize: number): number {
  const pages = totalPageCount(totalRows, pageSize)
  const requested = Number.isFinite(page) ? Math.floor(page) : 1
  if (requested < 1) {
    return 1
  }
  if (requested > pages) {
    return pages
  }
  return requested
}

/**
 * Derived pagination control state for a given page (Req 6.8–6.13).
 */
export type PaginationState = {
  /** Clamped 1-based current page. */
  page: number
  /** Effective page size used for the computation. */
  pageSize: number
  /** Normalised total row count. */
  totalRows: number
  /** Total number of pages (≥ 1). */
  totalPages: number
  /** Inclusive start index of the current page's slice: `(page - 1) * size`. */
  startIndex: number
  /** Exclusive end index of the current page's slice: `min(page * size, total)`. */
  endIndex: number
  /** Number of rows displayed on the current page: `endIndex - startIndex`. */
  visibleRows: number
  /** `true` exactly on the first page (Req 6.13). */
  prevDisabled: boolean
  /** `true` exactly on the last page (Req 6.13). */
  nextDisabled: boolean
}

/**
 * Compute the full pagination control state for a requested page.
 *
 * The page is clamped into `[1, totalPages]`; the slice bounds are
 * `[(page-1)*size, min(page*size, total))`; `prevDisabled` is true iff on the
 * first page and `nextDisabled` is true iff on the last page (Req 6.11–6.13).
 *
 * Pure function: no I/O, no side effects.
 */
export function getPaginationState(
  totalRows: number,
  pageSize: number,
  page: number,
): PaginationState {
  const total = normaliseTotal(totalRows)
  const size = normalisePageSize(pageSize)
  const totalPages = totalPageCount(total, size)
  const clamped = clampPage(page, total, size)

  const startIndex = (clamped - 1) * size
  const endIndex = Math.min(startIndex + size, total)

  return {
    page: clamped,
    pageSize: size,
    totalRows: total,
    totalPages,
    startIndex,
    endIndex,
    visibleRows: endIndex - startIndex,
    prevDisabled: clamped <= 1,
    nextDisabled: clamped >= totalPages,
  }
}

/**
 * Return the contiguous slice of rows displayed on `page` at `pageSize` rows
 * per page (Req 6.9, 6.12). The page is clamped to the row array's length, so
 * the returned slice is always a valid, in-bounds window.
 *
 * Pure function: the input array is not mutated.
 */
export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const state = getPaginationState(rows.length, pageSize, page)
  return rows.slice(state.startIndex, state.endIndex)
}

/**
 * Advance to the next page, clamped to the last page (Req 6.12, 6.13).
 *
 * Pure function: no I/O, no side effects.
 */
export function nextPage(page: number, totalRows: number, pageSize: number): number {
  return clampPage(clampPage(page, totalRows, pageSize) + 1, totalRows, pageSize)
}

/**
 * Step back to the previous page, clamped to the first page (Req 6.12, 6.13).
 *
 * Pure function: no I/O, no side effects.
 */
export function prevPage(page: number, totalRows: number, pageSize: number): number {
  return clampPage(clampPage(page, totalRows, pageSize) - 1, totalRows, pageSize)
}

/* ============================================================================
 * Sorting (Req 6.3)
 * ========================================================================== */

/** Active sort direction for the single sortable column. */
export type SortDirection = 'asc' | 'desc'

/**
 * The single active sort, or `null` when no column is sorted. At most one
 * column is ever active (Req 6.3).
 */
export type SortState = { columnId: string; direction: SortDirection } | null

/**
 * Apply a header activation to the current sort state (Req 6.3).
 *
 * - Activating a different (or initially unsorted) column sorts it ascending.
 * - Activating the already-active column toggles its direction asc⇄desc.
 *
 * Activation always yields exactly one active column, so single-column sorting
 * is preserved.
 *
 * Pure function: no I/O, no side effects.
 */
export function toggleSort(current: SortState, columnId: string): SortState {
  if (current != null && current.columnId === columnId) {
    return {
      columnId,
      direction: current.direction === 'asc' ? 'desc' : 'asc',
    }
  }
  return { columnId, direction: 'asc' }
}

/**
 * Total-order comparator over heterogeneous primitive cell values.
 *
 * Ordering rules (ascending):
 * - `null` / `undefined` / `NaN` sort last (treated as the greatest value).
 * - numbers compare numerically; `Date` values compare by timestamp.
 * - booleans compare with `false` before `true`.
 * - everything else compares by its string form using `localeCompare`.
 *
 * Returns a negative number when `a` precedes `b`, positive when `a` follows
 * `b`, and `0` when equivalent. Designed to be a strict-weak/total order so
 * sorted output is monotonic.
 *
 * Pure function: no I/O, no side effects.
 */
export function defaultComparator(a: unknown, b: unknown): number {
  const aNullish = isNullish(a)
  const bNullish = isNullish(b)
  if (aNullish && bNullish) {
    return 0
  }
  if (aNullish) {
    return 1
  }
  if (bNullish) {
    return -1
  }

  const aValue = normaliseSortValue(a)
  const bValue = normaliseSortValue(b)

  if (typeof aValue === 'number' && typeof bValue === 'number') {
    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
  }
  if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
    return aValue === bValue ? 0 : aValue ? 1 : -1
  }

  return String(aValue).localeCompare(String(bValue))
}

/** A value counts as "nullish" for sorting if it is null, undefined, or NaN. */
function isNullish(value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isNaN(value))
}

/** Reduce a non-nullish value to a comparable primitive (Date → timestamp). */
function normaliseSortValue(value: unknown): number | boolean | string {
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value
  }
  return String(value)
}

/**
 * Order `rows` by the active sort column (Req 6.3).
 *
 * Returns a new array sorted non-decreasing for `'asc'` and non-increasing for
 * `'desc'` by the value produced by `getValue(row, columnId)`. When `sort` is
 * `null` the original order is preserved (a shallow copy is returned). The
 * descending order is the exact reverse of the ascending order, so a second
 * header activation reverses the previous ordering.
 *
 * Pure function: the input array is not mutated.
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: SortState,
  getValue: (row: T, columnId: string) => unknown,
  comparator: (a: unknown, b: unknown) => number = defaultComparator,
): T[] {
  if (sort == null) {
    return [...rows]
  }

  const ascending = [...rows].sort((rowA, rowB) =>
    comparator(getValue(rowA, sort.columnId), getValue(rowB, sort.columnId)),
  )

  return sort.direction === 'asc' ? ascending : ascending.reverse()
}

/* ============================================================================
 * Column visibility (Req 7.4, 7.5)
 * ========================================================================== */

/**
 * Visibility selection keyed by column id. A column is visible unless its entry
 * is explicitly `false`, so an absent entry defaults to visible.
 */
export type ColumnVisibility = Record<string, boolean>

/**
 * Whether a column is currently visible. A column is visible unless its entry
 * in the selection is explicitly `false` (absent ⇒ visible).
 *
 * Pure function: no I/O, no side effects.
 */
export function isColumnVisible(visibility: ColumnVisibility, columnId: string): boolean {
  return visibility[columnId] !== false
}

/**
 * The subset of `toggleableIds` that is currently visible, preserving the
 * supplied column order.
 *
 * Pure function: no I/O, no side effects.
 */
export function visibleToggleableColumns(
  visibility: ColumnVisibility,
  toggleableIds: readonly string[],
): string[] {
  return toggleableIds.filter((id) => isColumnVisible(visibility, id))
}

/**
 * Toggle the visibility of a single toggleable data column, enforcing the
 * never-empty invariant (Req 7.4).
 *
 * - Showing a hidden column always succeeds.
 * - Hiding a visible column succeeds only when at least one other toggleable
 *   data column would remain visible; an attempt to hide the last visible
 *   toggleable column is rejected and the selection is returned unchanged.
 * - A `columnId` that is not in `toggleableIds` (e.g. the selection, expand, or
 *   row-action control columns) is never altered.
 *
 * Returns a new selection object on change; returns the original reference when
 * the toggle is a no-op or is rejected. Sorting, filtering, and pagination are
 * deliberately separate concerns, so column visibility is unaffected by them
 * (Req 7.5).
 *
 * Pure function: the input selection is not mutated.
 */
export function toggleColumnVisibility(
  visibility: ColumnVisibility,
  columnId: string,
  toggleableIds: readonly string[],
): ColumnVisibility {
  // Only toggleable data columns participate (Req 7.1 exclusions handled upstream).
  if (!toggleableIds.includes(columnId)) {
    return visibility
  }

  const currentlyVisible = isColumnVisible(visibility, columnId)

  if (currentlyVisible) {
    const visible = visibleToggleableColumns(visibility, toggleableIds)
    // Guard: refuse to hide the final visible toggleable column (Req 7.4).
    if (visible.length <= 1) {
      return visibility
    }
    return { ...visibility, [columnId]: false }
  }

  return { ...visibility, [columnId]: true }
}
