/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : filter-bar
 * Scope        : Admin — FilterBar primitive
 *
 * Description  : Token-driven Filter_Bar primitive for the admin design
 *                system. Renders only the controls a page configures — a
 *                debounced search input, filter dropdowns, a tabbed filter,
 *                and a column-visibility dropdown — and emits user selections
 *                to the associated DataTable (via shared page state). Contains
 *                no business logic; it shapes and forwards intent only.
 *
 * Responsibilities :
 * - Render exactly the configured controls (Req 8.1)
 * - Debounce the search emit by 300 ms and emit the trimmed term (Req 8.2)
 * - Cap the search input at 100 characters (Req 8.3)
 * - Emit dropdown / tab selections (Req 8.4, 8.5)
 * - List toggleable data columns with current state, emit visibility changes,
 *   and keep at least one column visible (Req 7.1, 7.4, 7.6, 8.6)
 * - Programmatically label every rendered control (Req 7.6, 8.7)
 *
 * Features / Functionality :
 * - FilterDropdown / TabOption / ColumnToggle local view types (self-contained)
 * - FilterBar component (controlled search + emit-only dropdowns/tabs/columns)
 * - Last-visible-column guard reusing @/components/ui/data-table-model
 *
 * Tech Stack   : React, TypeScript, @radix-ui/react-dropdown-menu,
 *                Tailwind CSS v4 (Brand Tokens), lucide-react
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : @/components/ui/icon, @/components/ui/use-debounced-callback,
 *                @/components/ui/data-table-model, @radix-ui/react-dropdown-menu,
 *                @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                Tailwind-palette literals (Req 1.2). View types are defined
 *                locally and NOT imported from data-table.tsx to avoid
 *                coupling. 'use client' required for control interactivity.
 *
 * Requirements : 7.1, 7.2, 7.3, 7.4, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 ************************************************************/

'use client'

import {
  type ColumnVisibility,
  toggleColumnVisibility,
  visibleToggleableColumns,
} from '@/components/ui/data-table-model'
import { Icon } from '@/components/ui/icon'
import { useDebouncedCallback } from '@/components/ui/use-debounced-callback'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@rgss/ui/lib/utils'
import { Check, Columns3, Search } from 'lucide-react'
import { useId, useState } from 'react'

/** Maximum characters accepted by the search input (Req 8.3). */
export const SEARCH_MAX_LENGTH = 100

/** Hint shown when a hide attempt would empty the table (Req 7.4). */
export const LAST_COLUMN_HINT = 'At least one column must stay visible'

/* ============================================================================
 * View types (self-contained — not imported from data-table.tsx)
 * ========================================================================== */

/** A selectable option for a filter dropdown or tabbed filter control. */
export type FilterOption = {
  /** Emitted value for this option. */
  value: string
  /** Human-readable option text. */
  label: string
}

/** A single filter dropdown control configuration (Req 8.4). */
export type FilterDropdown = {
  /** Stable identifier emitted alongside the selected value. */
  id: string
  /** Programmatic label naming the control for assistive technology (Req 8.7). */
  label: string
  /** Selectable options. */
  options: FilterOption[]
  /** Optional initial / controlled selected value (defaults to the first option). */
  value?: string
}

/** A single tab in the tabbed filter control (Req 8.5). */
export type TabOption = FilterOption

/**
 * A toggleable data column surfaced in the column-visibility control. Excludes
 * the selection, expand, and row-action control columns (handled upstream).
 * (Req 7.1)
 */
export type ColumnToggle = {
  /** Column identifier. */
  id: string
  /** Header label shown in the visibility list (Req 7.1). */
  label: string
  /** Current visibility state (Req 7.1, 7.6). */
  visible: boolean
}

/* ============================================================================
 * Component props
 * ========================================================================== */

/**
 * Props for {@link FilterBar}. Only the controls present in `config` render
 * (Req 8.1). Search is controlled; dropdowns, tabs, and column toggles are
 * emit-only (selection state is owned by the associated DataTable / page).
 */
export type FilterBarProps = {
  /** Designates which controls render (Req 8.1). */
  config: {
    /** Search input config. */
    search?: { placeholder: string; ariaLabel: string }
    /** Filter dropdown controls. */
    dropdowns?: FilterDropdown[]
    /** Tabbed filter control. */
    tabs?: { ariaLabel: string; options: TabOption[]; value?: string }
    /** Whether to render the column-visibility control. */
    columnVisibility?: boolean
  }
  /** Controlled search term. */
  search?: string
  /** Emits the trimmed search term, debounced by 300 ms (Req 8.2). */
  onSearchChange?: (trimmed: string) => void
  /** Emits a dropdown selection (Req 8.4). */
  onFilterChange?: (id: string, value: string) => void
  /** Emits a tab selection (Req 8.5). */
  onTabChange?: (value: string) => void
  /**
   * Toggleable data columns with their current visibility (Req 7.1). Required
   * for the column-visibility control to render its list.
   */
  columns?: ColumnToggle[]
  /** Emits an updated column visibility; blocked for the last visible column (Req 7.4, 8.6). */
  onColumnToggle?: (id: string, visible: boolean) => void
  className?: string
}

/* ============================================================================
 * Component
 * ========================================================================== */

/**
 * Render the configured filter controls and emit user intent to the associated
 * DataTable. Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link FilterBarProps}
 * @returns The rendered filter bar, or `null` when nothing is configured.
 */
export function FilterBar({
  config,
  search,
  onSearchChange,
  onFilterChange,
  onTabChange,
  columns,
  onColumnToggle,
  className,
}: FilterBarProps) {
  const hasSearch = config.search != null
  const hasDropdowns = (config.dropdowns?.length ?? 0) > 0
  const hasTabs = (config.tabs?.options.length ?? 0) > 0
  const hasColumnVisibility = config.columnVisibility === true && (columns?.length ?? 0) > 0

  // Render nothing when no controls are configured (Req 8.1).
  if (!(hasSearch || hasDropdowns || hasTabs || hasColumnVisibility)) {
    return null
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3 font-ui', className)}>
      {hasSearch ? (
        <SearchControl
          config={config.search as { placeholder: string; ariaLabel: string }}
          value={search}
          onSearchChange={onSearchChange}
        />
      ) : null}

      {hasTabs ? (
        <TabControl
          config={config.tabs as { ariaLabel: string; options: TabOption[]; value?: string }}
          onTabChange={onTabChange}
        />
      ) : null}

      {hasDropdowns
        ? config.dropdowns?.map((dropdown) => (
            <DropdownControl
              key={dropdown.id}
              dropdown={dropdown}
              onFilterChange={onFilterChange}
            />
          ))
        : null}

      {hasColumnVisibility ? (
        <ColumnVisibilityControl
          columns={columns as ColumnToggle[]}
          onColumnToggle={onColumnToggle}
        />
      ) : null}
    </div>
  )
}

/* ============================================================================
 * Search input (Req 8.2, 8.3, 8.7)
 * ========================================================================== */

function SearchControl({
  config,
  value,
  onSearchChange,
}: {
  config: { placeholder: string; ariaLabel: string }
  value?: string | undefined
  onSearchChange?: ((trimmed: string) => void) | undefined
}) {
  const inputId = useId()
  // Local mirror so typing is instant while the emit is debounced.
  const [term, setTerm] = useState(value ?? '')

  // Emit the trimmed term only after 300 ms of quiet (Req 8.2).
  const emitDebounced = useDebouncedCallback((next: string) => {
    onSearchChange?.(next.trim())
  })

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setTerm(next)
    emitDebounced(next)
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={inputId}>
        {config.ariaLabel}
      </label>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-dusty-gray">
        <Icon icon={Search} decorative size={16} />
      </span>
      <input
        className={cn(
          'h-9 w-56 rounded-buttons border border-outline-gray bg-canvas-white pl-8 pr-3',
          'font-ui text-sm text-cocoa-dark placeholder:text-dusty-gray',
          'focus:border-cocoa-dark focus:outline-none focus:ring-2 focus:ring-cocoa-dark/20',
        )}
        id={inputId}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={handleChange}
        placeholder={config.placeholder}
        type="search"
        value={term}
      />
    </div>
  )
}

/* ============================================================================
 * Tabbed filter (Req 8.5, 8.7)
 * ========================================================================== */

function TabControl({
  config,
  onTabChange,
}: {
  config: { ariaLabel: string; options: TabOption[]; value?: string }
  onTabChange?: ((value: string) => void) | undefined
}) {
  const [active, setActive] = useState(config.value ?? config.options[0]?.value ?? '')

  function handleSelect(value: string) {
    setActive(value)
    onTabChange?.(value)
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-buttons bg-cloud-gray p-1"
      aria-label={config.ariaLabel}
      role="tablist"
    >
      {config.options.map((option) => {
        const selected = option.value === active
        return (
          <button
            aria-selected={selected}
            className={cn(
              'rounded-buttons px-3 py-1 font-ui text-sm transition-colors duration-150 motion-reduce:transition-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-cocoa-dark/30',
              selected
                ? 'bg-canvas-white text-cocoa-dark shadow-sm'
                : 'text-warm-gray hover:text-cocoa-dark',
            )}
            key={option.value}
            onClick={() => handleSelect(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/* ============================================================================
 * Filter dropdown (Req 8.4, 8.7)
 * ========================================================================== */

function DropdownControl({
  dropdown,
  onFilterChange,
}: {
  dropdown: FilterDropdown
  onFilterChange?: ((id: string, value: string) => void) | undefined
}) {
  const selectId = useId()
  const [value, setValue] = useState(dropdown.value ?? dropdown.options[0]?.value ?? '')

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    setValue(next)
    onFilterChange?.(dropdown.id, next)
  }

  return (
    <div>
      <label className="sr-only" htmlFor={selectId}>
        {dropdown.label}
      </label>
      <select
        className={cn(
          'h-9 rounded-buttons border border-outline-gray bg-canvas-white px-3',
          'font-ui text-sm text-cocoa-dark',
          'focus:border-cocoa-dark focus:outline-none focus:ring-2 focus:ring-cocoa-dark/20',
        )}
        id={selectId}
        onChange={handleChange}
        value={value}
      >
        {dropdown.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ============================================================================
 * Column-visibility control (Req 7.1, 7.4, 7.6, 8.6)
 * ========================================================================== */

function ColumnVisibilityControl({
  columns,
  onColumnToggle,
}: {
  columns: ColumnToggle[]
  onColumnToggle?: ((id: string, visible: boolean) => void) | undefined
}) {
  // Whether the last hide attempt was blocked (drives the inline hint, Req 7.4).
  const [blocked, setBlocked] = useState(false)

  const toggleableIds = columns.map((column) => column.id)
  const hintId = useId()

  function handleToggle(column: ColumnToggle) {
    // Reuse the pure guard model so the never-empty invariant matches the table.
    const visibility: ColumnVisibility = Object.fromEntries(
      columns.map((entry) => [entry.id, entry.visible]),
    )
    const next = toggleColumnVisibility(visibility, column.id, toggleableIds)

    // The model returns the same reference when a hide is rejected (Req 7.4).
    if (next === visibility) {
      setBlocked(true)
      return
    }

    setBlocked(false)
    onColumnToggle?.(column.id, next[column.id] !== false)
  }

  const visibleCount = visibleToggleableColumns(
    Object.fromEntries(columns.map((entry) => [entry.id, entry.visible])),
    toggleableIds,
  ).length

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-buttons border border-outline-gray bg-canvas-white px-3',
          'font-ui text-sm text-cocoa-dark',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-cocoa-dark/20',
          'data-[state=open]:border-cocoa-dark',
        )}
        aria-label="Toggle column visibility"
      >
        <Icon icon={Columns3} decorative size={16} />
        Columns
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className={cn(
            'z-50 min-w-48 rounded-cards border border-outline-gray bg-canvas-white p-1.5 shadow-card-hover',
          )}
          sideOffset={6}
        >
          <DropdownMenu.Label className="px-2 py-1.5 font-ui text-xs font-medium text-warm-gray">
            Visible columns
          </DropdownMenu.Label>

          {columns.map((column) => {
            // The last visible column cannot be hidden (Req 7.4).
            const isLastVisible = column.visible && visibleCount <= 1
            return (
              <DropdownMenu.CheckboxItem
                aria-describedby={isLastVisible ? hintId : undefined}
                checked={column.visible}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-buttons px-2 py-1.5 font-ui text-sm text-cocoa-dark',
                  'outline-none data-[highlighted]:bg-cloud-gray',
                )}
                key={column.id}
                // Keep the menu open across multiple toggles.
                onSelect={(event) => {
                  event.preventDefault()
                  handleToggle(column)
                }}
              >
                <span className="flex h-4 w-4 items-center justify-center text-cocoa-dark">
                  <DropdownMenu.ItemIndicator>
                    <Icon icon={Check} decorative size={14} />
                  </DropdownMenu.ItemIndicator>
                </span>
                {column.label}
              </DropdownMenu.CheckboxItem>
            )
          })}

          {blocked ? (
            <p className="px-2 py-1.5 font-ui text-xs text-warm-gray" id={hintId} role="status">
              {LAST_COLUMN_HINT}
            </p>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
