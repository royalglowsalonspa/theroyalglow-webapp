/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : data-table-model.test
 * Scope        : Property-based tests for the pure DataTable model
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/
 *                components/ui/data-table-model.ts`. Each `describe` block
 *                corresponds to one numbered correctness property from the
 *                admin-portal-redesign design.
 *
 * Notes        : Append-only — tasks 6.2 / 6.3 / 6.4 share this file. Add a new
 *                `describe` block per property; do NOT overwrite sibling
 *                property tests.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  type ColumnVisibility,
  defaultComparator,
  getPaginationState,
  isColumnVisible,
  nextPage,
  type PageSize,
  PAGE_SIZES,
  pageSlice,
  prevPage,
  type SortState,
  sortRows,
  toggleColumnVisibility,
  totalPageCount,
  toggleSort,
  visibleToggleableColumns,
} from './data-table-model'

// Feature: admin-portal-redesign, Property 6: Column-visibility invariant — never empty, preserved across ops
//
// Property 6: Column-visibility invariant — never empty, preserved across ops
// Validates: Requirements 7.4, 7.5
//
// For any initial set of toggleable data columns and any sequence of toggle
// attempts interleaved with sorting, filtering, and pagination operations, the
// set of visible toggleable data columns is never empty — an attempt to hide
// the last visible toggleable column is rejected and that column stays visible
// (Req 7.4) — and no sort / filter / paginate operation changes the
// column-visibility selection (Req 7.5).

describe('Property 6: Column-visibility invariant — never empty, preserved across ops', () => {
  /** A single non-empty, slash-free column id. */
  const columnIdArb = fc
    .string({ minLength: 1, maxLength: 6 })
    .filter((s) => s.trim() !== '')

  /** A non-empty set of unique toggleable data-column ids. */
  const toggleableIdsArb = fc.uniqueArray(columnIdArb, { minLength: 1, maxLength: 6 })

  /**
   * Operations interleaved into the sequence. Only `toggle` touches visibility;
   * `sort` / `filter` / `paginate` are visibility-agnostic data operations.
   */
  type Op =
    | { type: 'toggle'; columnId: string }
    | { type: 'sort' }
    | { type: 'filter' }
    | { type: 'paginate' }

  /**
   * Build the op-sequence generator for a concrete id set. Toggle targets are
   * drawn mostly from the real id set, but sometimes an arbitrary (possibly
   * non-toggleable) id is used to exercise the no-op guard.
   */
  const opsArbFor = (ids: readonly string[]) =>
    fc.array(
      fc.oneof(
        fc
          .oneof(fc.constantFrom(...ids), columnIdArb)
          .map((columnId): Op => ({ type: 'toggle', columnId })),
        fc.constant<Op>({ type: 'sort' }),
        fc.constant<Op>({ type: 'filter' }),
        fc.constant<Op>({ type: 'paginate' }),
      ),
      { minLength: 1, maxLength: 30 },
    )

  /** A dummy row set so sort/filter/paginate operations are genuinely exercised. */
  const ROWS: ReadonlyArray<{ id: number }> = Array.from({ length: 12 }, (_, i) => ({ id: i }))
  const SORT: SortState = { columnId: 'id', direction: 'asc' }
  const getValue = (row: { id: number }, _columnId: string): unknown => row.id

  it('never empties the visible set and is preserved across sort/filter/paginate', () => {
    fc.assert(
      fc.property(
        toggleableIdsArb.chain((ids) => fc.tuple(fc.constant(ids), opsArbFor(ids))),
        ([toggleableIds, ops]) => {
          // Initial selection: every column visible (absent ⇒ visible).
          let visibility: ColumnVisibility = {}

          // Precondition holds at the start.
          expect(visibleToggleableColumns(visibility, toggleableIds).length).toBeGreaterThanOrEqual(
            1,
          )

          for (const op of ops) {
            const before = visibility

            switch (op.type) {
              case 'toggle': {
                const wasVisible = isColumnVisible(before, op.columnId)
                const visibleBefore = visibleToggleableColumns(before, toggleableIds)
                const isLastVisible =
                  toggleableIds.includes(op.columnId) &&
                  wasVisible &&
                  visibleBefore.length <= 1

                visibility = toggleColumnVisibility(before, op.columnId, toggleableIds)

                if (isLastVisible) {
                  // Req 7.4: hiding the last visible column is rejected; the
                  // selection is returned unchanged (same reference).
                  expect(visibility).toBe(before)
                  expect(isColumnVisible(visibility, op.columnId)).toBe(true)
                }
                break
              }
              // Req 7.5: data operations must not alter the visibility selection.
              case 'sort': {
                sortRows(ROWS, SORT, getValue)
                expect(visibility).toBe(before)
                break
              }
              case 'filter': {
                ROWS.filter((row) => row.id % 2 === 0)
                expect(visibility).toBe(before)
                break
              }
              case 'paginate': {
                pageSlice(ROWS, 2, 5)
                expect(visibility).toBe(before)
                break
              }
              default:
                break
            }

            // Core invariant (Req 7.4): the visible toggleable set is never empty.
            expect(
              visibleToggleableColumns(visibility, toggleableIds).length,
            ).toBeGreaterThanOrEqual(1)
          }
        },
      ),
      { numRuns: 25 },
    )
  })
})

// Feature: admin-portal-redesign, Property 7: Pagination stays in bounds with correct slice and control state
//
// Property 7: Pagination stays in bounds with correct slice and control state
// Validates: Requirements 6.8, 6.9, 6.11, 6.12, 6.13
//
// For arbitrary total row counts (>= 0), page sizes drawn from the allowed
// {10, 25, 50, 100} set, and arbitrary prev/next navigation sequences:
//   - the current page always stays within [1, totalPages];
//   - the displayed slice equals rows[(page-1)*size, min(page*size, total));
//   - visibleRows equals min(size, total - startIndex);
//   - prevDisabled is true iff page === 1;
//   - nextDisabled is true iff page === totalPages.

describe('Property 7: Pagination stays in bounds with correct slice and control state', () => {
  /** A navigation step applied to the current page. */
  type NavStep = 'prev' | 'next'

  /** Allowed page sizes as a fast-check arbitrary (Req 6.8). */
  const pageSizeArb: fc.Arbitrary<PageSize> = fc.constantFrom(...PAGE_SIZES)

  /** Arbitrary non-negative total row count. */
  const totalRowsArb: fc.Arbitrary<number> = fc.nat({ max: 10_000 })

  /** Arbitrary 1-based starting page request (incl. out-of-range values). */
  const startPageArb: fc.Arbitrary<number> = fc.integer({ min: -5, max: 10_005 })

  /** Arbitrary sequence of prev/next navigation steps. */
  const navSequenceArb: fc.Arbitrary<NavStep[]> = fc.array(
    fc.constantFrom<NavStep>('prev', 'next'),
    { maxLength: 50 },
  )

  /**
   * Replay a prev/next sequence from an arbitrary starting page, returning the
   * resulting clamped page after every step.
   */
  function replay(
    totalRows: number,
    pageSize: number,
    startPage: number,
    steps: readonly NavStep[],
  ): number {
    let page = getPaginationState(totalRows, pageSize, startPage).page
    for (const step of steps) {
      page =
        step === 'next'
          ? nextPage(page, totalRows, pageSize)
          : prevPage(page, totalRows, pageSize)
    }
    return page
  }

  it('keeps the current page within [1, totalPages] across any prev/next sequence', () => {
    fc.assert(
      fc.property(
        totalRowsArb,
        pageSizeArb,
        startPageArb,
        navSequenceArb,
        (totalRows, pageSize, startPage, steps) => {
          const totalPages = totalPageCount(totalRows, pageSize)
          const page = replay(totalRows, pageSize, startPage, steps)
          expect(page).toBeGreaterThanOrEqual(1)
          expect(page).toBeLessThanOrEqual(totalPages)
          expect(Number.isInteger(page)).toBe(true)
        },
      ),
      { numRuns: 25 },
    )
  })

  it('produces the exact contiguous slice rows[(page-1)*size, min(page*size, total))', () => {
    fc.assert(
      fc.property(
        totalRowsArb,
        pageSizeArb,
        startPageArb,
        navSequenceArb,
        (totalRows, pageSize, startPage, steps) => {
          const rows = Array.from({ length: totalRows }, (_, i) => i)
          const page = replay(totalRows, pageSize, startPage, steps)

          const startIndex = (page - 1) * pageSize
          const endIndex = Math.min(page * pageSize, totalRows)
          const expected = rows.slice(startIndex, endIndex)

          const state = getPaginationState(totalRows, pageSize, page)
          expect(state.startIndex).toBe(startIndex)
          expect(state.endIndex).toBe(endIndex)
          expect(pageSlice(rows, page, pageSize)).toEqual(expected)
        },
      ),
      { numRuns: 25 },
    )
  })

  it('reports visibleRows = min(size, total - startIndex)', () => {
    fc.assert(
      fc.property(
        totalRowsArb,
        pageSizeArb,
        startPageArb,
        navSequenceArb,
        (totalRows, pageSize, startPage, steps) => {
          const rows = Array.from({ length: totalRows }, (_, i) => i)
          const page = replay(totalRows, pageSize, startPage, steps)
          const state = getPaginationState(totalRows, pageSize, page)
          const expectedVisible = Math.min(pageSize, totalRows - state.startIndex)
          expect(state.visibleRows).toBe(expectedVisible)
          expect(state.visibleRows).toBeGreaterThanOrEqual(0)
          expect(state.visibleRows).toBe(pageSlice(rows, page, pageSize).length)
        },
      ),
      { numRuns: 25 },
    )
  })

  it('disables prev iff on the first page and next iff on the last page', () => {
    fc.assert(
      fc.property(
        totalRowsArb,
        pageSizeArb,
        startPageArb,
        navSequenceArb,
        (totalRows, pageSize, startPage, steps) => {
          const page = replay(totalRows, pageSize, startPage, steps)
          const state = getPaginationState(totalRows, pageSize, page)
          expect(state.prevDisabled).toBe(state.page === 1)
          expect(state.nextDisabled).toBe(state.page === state.totalPages)
        },
      ),
      { numRuns: 25 },
    )
  })
})

// Feature: admin-portal-redesign, Property 8: Sorting orders by the active column and toggles direction
//
// Property 8: Sorting orders by the active column and toggles direction
// Validates: Requirements 6.3
//
// For arbitrary row arrays and a column accessor:
//   - after toggleSort activates a column, sortRows yields rows that are
//     monotonically non-decreasing (asc) by that column under defaultComparator;
//   - a second toggleSort on the same column reverses to non-increasing (desc),
//     and the descending order is the exact reverse of the ascending order;
//   - toggleSort always yields exactly one active column (single-column sort),
//     switching the active column when a different header is activated.

describe('Property 8: Sorting orders by the active column and toggles direction', () => {
  const COLUMN_ID = 'value'

  /** A row carries the sorted cell value plus a stable tag for identity. */
  type Row = { value: unknown; tag: number }

  const getValue = (row: Row, columnId: string): unknown =>
    (row as unknown as Record<string, unknown>)[columnId]

  /**
   * Homogeneous-per-run cell arrays (optionally peppered with nullish values)
   * so `defaultComparator` is a genuine total order for the run. Mixing
   * unrelated primitive types in a single column is not a real DataTable case
   * and would not yield a total order, so each generated column is single-typed.
   */
  const cellsArb: fc.Arbitrary<unknown[]> = fc.oneof(
    fc.array(fc.option(fc.integer(), { nil: null }), { maxLength: 40 }),
    fc.array(fc.option(fc.double({ noNaN: true }), { nil: null }), { maxLength: 40 }),
    fc.array(fc.option(fc.string(), { nil: undefined }), { maxLength: 40 }),
    fc.array(fc.option(fc.boolean(), { nil: null }), { maxLength: 40 }),
  )

  /** Build tagged rows from a generated cell array. */
  const rowsArb: fc.Arbitrary<Row[]> = cellsArb.map((cells) =>
    cells.map((value, tag) => ({ value, tag })),
  )

  it('sorts ascending into monotonic non-decreasing order by the active column', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const sort = toggleSort(null, COLUMN_ID)
        // Single active column, ascending on first activation (Req 6.3).
        expect(sort).toEqual({ columnId: COLUMN_ID, direction: 'asc' })

        const sorted = sortRows(rows, sort, getValue)

        // Same multiset of rows, no rows gained or lost.
        expect(sorted).toHaveLength(rows.length)
        expect([...sorted].map((r) => r.tag).sort((a, b) => a - b)).toEqual(
          rows.map((r) => r.tag).sort((a, b) => a - b),
        )

        // Monotonic non-decreasing under the comparator.
        const values = sorted.map((r) => getValue(r, COLUMN_ID))
        for (let i = 0; i + 1 < values.length; i++) {
          expect(defaultComparator(values[i], values[i + 1])).toBeLessThanOrEqual(0)
        }
      }),
      { numRuns: 25 },
    )
  })

  it('reverses to non-increasing order on a second activation of the same column', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const ascSort = toggleSort(null, COLUMN_ID)
        const descSort = toggleSort(ascSort, COLUMN_ID)
        // Second activation toggles asc -> desc, still a single active column.
        expect(descSort).toEqual({ columnId: COLUMN_ID, direction: 'desc' })

        const ascending = sortRows(rows, ascSort, getValue)
        const descending = sortRows(rows, descSort, getValue)

        // Descending is the exact reverse of ascending.
        expect(descending.map((r) => r.tag)).toEqual([...ascending].reverse().map((r) => r.tag))

        // Monotonic non-increasing under the comparator.
        const values = descending.map((r) => getValue(r, COLUMN_ID))
        for (let i = 0; i + 1 < values.length; i++) {
          expect(defaultComparator(values[i], values[i + 1])).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 25 },
    )
  })

  it('keeps exactly one active sort column, switching when a different header is activated', () => {
    const columnIdArb = fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim() !== '')

    fc.assert(
      fc.property(
        fc.tuple(columnIdArb, columnIdArb).filter(([a, b]) => a !== b),
        ([first, second]) => {
          // First activation: ascending on `first`, single active column.
          const s1 = toggleSort(null, first)
          expect(s1).toEqual({ columnId: first, direction: 'asc' })

          // Second activation of the same column: toggles to descending.
          const s2 = toggleSort(s1, first)
          expect(s2).toEqual({ columnId: first, direction: 'desc' })

          // Third activation of the same column: toggles back to ascending.
          const s3 = toggleSort(s2, first)
          expect(s3).toEqual({ columnId: first, direction: 'asc' })

          // Activating a different header switches the single active column,
          // resetting to ascending — the previous column is no longer active.
          const s4 = toggleSort(s3, second)
          expect(s4).toEqual({ columnId: second, direction: 'asc' })
          expect(s4?.columnId).not.toBe(first)
        },
      ),
      { numRuns: 25 },
    )
  })
})
