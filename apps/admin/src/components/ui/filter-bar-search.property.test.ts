/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : filter-bar-search.property.test
 * Scope        : Property-based test for FilterBar search-term trimming
 *
 * Description  : fast-check + Vitest + @testing-library/react property test
 *                verifying the FilterBar search control's pure, observable
 *                emit behaviour: after the 300 ms debounce, the value emitted
 *                via `onSearchChange` is exactly `input.trim()` — leading and
 *                trailing whitespace removed, inner content untouched, empty /
 *                whitespace-only input collapsing to an empty string.
 *
 * Notes        : Presentation-layer test only. The FilterBar component is
 *                consumed as-is; this file asserts behaviour and changes no
 *                production code. Uses jsdom + fake timers to drive the debounce
 *                deterministically. Written as `.ts` (no JSX) via
 *                `React.createElement` so it runs under the admin jsdom project.
 ************************************************************/

import { cleanup, fireEvent, render } from '@testing-library/react'
import fc from 'fast-check'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterBar, SEARCH_MAX_LENGTH } from '@/components/ui/filter-bar'

// Feature: admin-portal-redesign, Property 10: Search term is emitted trimmed
//
// Property 10: Search term is emitted trimmed
// Validates: Requirements 8.2
//
// The FilterBar search input emits its term to `onSearchChange` only after a
// 300 ms debounce, and the emitted value is the trimmed input — i.e. for any
// typed string `raw`, the single emitted argument equals `raw.trim()`.

const SEARCH_CONFIG = {
  search: { placeholder: 'Search', ariaLabel: 'Search records' },
} as const

/**
 * Render FilterBar with only the search control configured, type `raw` into the
 * search input, advance fake timers past the 300 ms debounce, and return the
 * single value emitted via `onSearchChange`.
 */
function emitFor(raw: string): { emitted: string; calls: number } {
  const onSearchChange = vi.fn<(trimmed: string) => void>()

  const { container } = render(
    createElement(FilterBar, { config: SEARCH_CONFIG, onSearchChange }),
  )

  const input = container.querySelector(
    'input[type="search"]',
  ) as HTMLInputElement

  // fireEvent.change sets the value programmatically (maxLength is enforced only
  // for user-originated input in jsdom), so the component's onChange receives
  // exactly `raw` and schedules the debounced emit.
  fireEvent.change(input, { target: { value: raw } })

  // Fire the debounce timer; the emit runs inside this synchronous flush.
  vi.advanceTimersByTime(300)

  const calls = onSearchChange.mock.calls.length
  const emitted = calls > 0 ? (onSearchChange.mock.calls.at(-1)?.[0] ?? '') : ''
  return { emitted, calls }
}

describe('Property 10: Search term is emitted trimmed (Req 8.2)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('emits exactly input.trim() for arbitrary strings (incl. leading/trailing/inner whitespace and empty)', () => {
    fc.assert(
      fc.property(
        // Bias the input space toward whitespace-heavy strings so the trim is
        // genuinely exercised: pad an arbitrary core with arbitrary runs of
        // whitespace on both sides, and include the empty string.
        fc.tuple(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'), {
            maxLength: 8,
          }),
          fc.string({ maxLength: 60 }),
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'), {
            maxLength: 8,
          }),
        ),
        ([lead, core, trail]) => {
          vi.useFakeTimers()
          try {
            const raw = `${lead}${core}${trail}`
            const { emitted } = emitFor(raw)
            expect(emitted).toBe(raw.trim())
          } finally {
            cleanup()
            vi.clearAllTimers()
            vi.useRealTimers()
          }
        },
      ),
      { numRuns: 25 },
    )
  })

  it('emits "" for whitespace-only and empty input', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'), {
          maxLength: 12,
        }),
        (whitespace) => {
          vi.useFakeTimers()
          try {
            const { emitted } = emitFor(whitespace)
            expect(emitted).toBe('')
            expect(whitespace.trim()).toBe('')
          } finally {
            cleanup()
            vi.clearAllTimers()
            vi.useRealTimers()
          }
        },
      ),
      { numRuns: 25 },
    )
  })

  it('does not crash and still emits input.trim() for over-long input (> SEARCH_MAX_LENGTH)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: SEARCH_MAX_LENGTH, maxLength: 120 }),
        (raw) => {
          vi.useFakeTimers()
          try {
            const { emitted } = emitFor(raw)
            // The property is about the trim of what the control emits; the
            // emit is driven by the change value, so it equals raw.trim().
            expect(emitted).toBe(raw.trim())
          } finally {
            cleanup()
            vi.clearAllTimers()
            vi.useRealTimers()
          }
        },
      ),
      { numRuns: 25 },
    )
  })
})
