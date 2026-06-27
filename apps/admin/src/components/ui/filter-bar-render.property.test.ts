/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : filter-bar-render.property.test
 * Scope        : Property-based test for FilterBar control rendering
 *
 * Description  : fast-check + Vitest + @testing-library/react property test
 *                verifying that FilterBar renders EXACTLY the controls named in
 *                its `config` — no more, no less. For an arbitrary boolean
 *                combination of the four controls (search, dropdowns, tabs,
 *                column-visibility), each configured control is present and each
 *                non-configured control is absent. When NO control is
 *                configured the component renders nothing (empty container).
 *
 * Notes        : Presentation-layer test only. The FilterBar component is
 *                consumed as-is; this file asserts behaviour and changes no
 *                production code. Written as `.ts` (no JSX) via
 *                `React.createElement` so it runs under the admin jsdom project.
 ************************************************************/

import {
  type ColumnToggle,
  FilterBar,
  type FilterBarProps,
  type FilterDropdown,
  type TabOption,
} from '@/components/ui/filter-bar'
import { cleanup, render, within } from '@testing-library/react'
import fc from 'fast-check'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

// Feature: admin-portal-redesign, Property 9: FilterBar renders exactly the
// configured controls
//
// Property 9: FilterBar renders exactly the configured controls
// Validates: Requirements 8.1
//
// For any boolean combination of {search, dropdowns, tabs, columnVisibility},
// FilterBar renders precisely the configured controls and omits the rest;
// configuring none renders an empty container.

/* ----------------------------------------------------------------------------
 * Stable query helpers — identify each control by a stable, role/type query.
 * -------------------------------------------------------------------------- */

/** Column-visibility trigger carries this programmatic label (Req 8.7). */
const COLUMN_TRIGGER_LABEL = 'Toggle column visibility'

function searchPresent(container: HTMLElement): boolean {
  return container.querySelector('input[type="search"]') != null
}

function tabsPresent(container: HTMLElement): boolean {
  return container.querySelector('[role="tablist"]') != null
}

function columnVisibilityPresent(container: HTMLElement): boolean {
  return container.querySelector(`[aria-label="${COLUMN_TRIGGER_LABEL}"]`) != null
}

/* ----------------------------------------------------------------------------
 * Generators — each enabled control carries the minimum valid content the
 * component needs to actually render (dropdowns >= 1, tabs >= 1 option,
 * columnVisibility flag + columns >= 1).
 * -------------------------------------------------------------------------- */

const optionArb: fc.Arbitrary<TabOption> = fc.record({
  value: fc.string({ minLength: 1, maxLength: 8 }),
  label: fc.string({ minLength: 1, maxLength: 12 }),
})

/** Dropdowns with deterministic, unique, whitespace-free labels/ids so
 *  getByLabelText (which normalises whitespace) resolves each control. */
const dropdownsArb: fc.Arbitrary<FilterDropdown[]> = fc
  .array(
    fc.record({
      options: fc.array(optionArb, { minLength: 1, maxLength: 3 }),
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((raw) =>
    raw.map((d, i) => ({
      id: `dropdown-${i}`,
      label: `Filter ${i}`,
      options: d.options,
    })),
  )

const tabsArb = fc.record({
  ariaLabel: fc.constant('Status filter'),
  options: fc.array(optionArb, { minLength: 1, maxLength: 4 }),
})

const columnsArb: fc.Arbitrary<ColumnToggle[]> = fc
  .array(
    fc.record({
      label: fc.string({ minLength: 1, maxLength: 10 }),
      visible: fc.boolean(),
    }),
    { minLength: 1, maxLength: 4 },
  )
  .map((raw) => raw.map((c, i) => ({ id: `col-${i}`, label: `Column ${i}`, visible: c.visible })))

type Scenario = {
  props: FilterBarProps
  want: {
    search: boolean
    dropdowns: FilterDropdown[] | null
    tabs: boolean
    columnVisibility: boolean
  }
}

/** Build a FilterBar scenario from four independent enable flags + content. */
const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    enableSearch: fc.boolean(),
    enableDropdowns: fc.boolean(),
    enableTabs: fc.boolean(),
    enableColumns: fc.boolean(),
    dropdowns: dropdownsArb,
    tabs: tabsArb,
    columns: columnsArb,
  })
  .map((g) => {
    const config: FilterBarProps['config'] = {}
    if (g.enableSearch) {
      config.search = { placeholder: 'Search', ariaLabel: 'Search records' }
    }
    if (g.enableDropdowns) {
      config.dropdowns = g.dropdowns
    }
    if (g.enableTabs) {
      config.tabs = g.tabs
    }
    if (g.enableColumns) {
      config.columnVisibility = true
    }

    const props: FilterBarProps = { config }
    if (g.enableColumns) {
      props.columns = g.columns
    }

    return {
      props,
      want: {
        search: g.enableSearch,
        dropdowns: g.enableDropdowns ? g.dropdowns : null,
        tabs: g.enableTabs,
        columnVisibility: g.enableColumns,
      },
    }
  })

/* ----------------------------------------------------------------------------
 * Property
 * -------------------------------------------------------------------------- */

describe('Property 9: FilterBar renders exactly the configured controls (Req 8.1)', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders every configured control and omits every non-configured control', () => {
    fc.assert(
      fc.property(scenarioArb, ({ props, want }) => {
        try {
          const { container } = render(createElement(FilterBar, props))

          // Search.
          expect(searchPresent(container)).toBe(want.search)

          // Tabs.
          expect(tabsPresent(container)).toBe(want.tabs)

          // Column visibility.
          expect(columnVisibilityPresent(container)).toBe(want.columnVisibility)

          // Dropdowns — each configured dropdown surfaces a labelled <select>.
          const selects = container.querySelectorAll('select')
          if (want.dropdowns) {
            expect(selects.length).toBe(want.dropdowns.length)
            const view = within(container)
            for (const dropdown of want.dropdowns) {
              const control = view.getByLabelText(dropdown.label)
              expect(control.tagName).toBe('SELECT')
            }
          } else {
            expect(selects.length).toBe(0)
          }

          // When nothing is configured the component renders null (empty container).
          const anyConfigured =
            want.search || want.tabs || want.columnVisibility || (want.dropdowns?.length ?? 0) > 0
          if (!anyConfigured) {
            expect(container.firstChild).toBeNull()
          }
        } finally {
          cleanup()
        }
      }),
      { numRuns: 25 },
    )
  })
})
