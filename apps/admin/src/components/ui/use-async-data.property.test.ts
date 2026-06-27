/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : use-async-data.property.test
 * Scope        : Admin — async-data reducer (deterministic timeout outcome)
 *
 * Description  : fast-check + Vitest property test for the PURE
 *                asyncDataReducer that backs useAsyncData. It models the
 *                resolve-vs-timeout race with a deterministic timer model (no
 *                React, no real timers): the first event to fire wins. When the
 *                fetch resolveDelay is strictly less than the timeoutMs, a
 *                'resolve' is dispatched first and the state settles to
 *                'success'; otherwise a 'reject'(timeout) fires first and the
 *                state settles to 'error' with a retry available.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests. Tests the pure reducer model
 *                only, per the design guidance for Property 15.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ASYNC_TIMEOUT_MESSAGE,
  type AsyncAction,
  asyncDataReducer,
  initialAsyncState,
} from './use-async-data'

// Feature: admin-portal-redesign, Property 15: Async timeout outcome is deterministic
//
// For any fetch resolve delay and any timeout value, the async-data state
// settles to 'success' iff the fetch resolves strictly before the timeout
// deadline, and otherwise settles to 'error' with a retry available.
//
// Validates: Requirements 12.6, 10.8

type Payload = number

/**
 * Deterministic timer model of the resolve-vs-timeout race driven through the
 * pure reducer. Starting from the initial `loading` state, the event whose
 * delay is smaller fires first; ties go to the timeout (a fetch that resolves
 * exactly at the deadline has NOT resolved *strictly before* it, so the
 * timeout wins). The losing event is still dispatched afterwards to assert the
 * first-wins invariant: once settled, the opposite event must not change the
 * terminal state.
 */
function runRace(resolveDelay: number, timeoutMs: number, data: Payload) {
  const resolveAction: AsyncAction<Payload> = { type: 'resolve', data }
  const rejectAction: AsyncAction<Payload> = {
    type: 'reject',
    message: ASYNC_TIMEOUT_MESSAGE,
  }

  // success iff the fetch resolves STRICTLY before the deadline.
  const resolveFirst = resolveDelay < timeoutMs

  const first = resolveFirst ? resolveAction : rejectAction
  const second = resolveFirst ? rejectAction : resolveAction

  let state = initialAsyncState<Payload>()
  state = asyncDataReducer(state, first)
  const afterFirst = state
  // Later, opposite event arrives — must be ignored (first-wins / terminal).
  state = asyncDataReducer(state, second)

  return { afterFirst, afterSecond: state, resolveFirst }
}

describe('Property 15: Async timeout outcome is deterministic', () => {
  it('settles to success iff resolveDelay < timeoutMs, else error (first-wins)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 120_000 }),
        fc.integer({ min: 1, max: 120_000 }),
        fc.integer(),
        (resolveDelay, timeoutMs, data) => {
          const { afterFirst, afterSecond, resolveFirst } = runRace(resolveDelay, timeoutMs, data)

          if (resolveFirst) {
            expect(afterFirst.status).toBe('success')
            expect(afterFirst).toEqual({ status: 'success', data })
          } else {
            expect(afterFirst.status).toBe('error')
            expect(afterFirst).toEqual({
              status: 'error',
              message: ASYNC_TIMEOUT_MESSAGE,
            })
          }

          // First-wins: the later opposite event does NOT change the terminal
          // state.
          expect(afterSecond).toEqual(afterFirst)
        },
      ),
      { numRuns: 25 },
    )
  })

  it('a request action returns a settled state to loading (retry)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 120_000 }),
        fc.integer({ min: 1, max: 120_000 }),
        fc.integer(),
        (resolveDelay, timeoutMs, data) => {
          const { afterSecond } = runRace(resolveDelay, timeoutMs, data)
          // retry: error/success -> loading.
          const retried = asyncDataReducer(afterSecond, { type: 'request' })
          expect(retried).toEqual({ status: 'loading' })
        },
      ),
      { numRuns: 25 },
    )
  })

  // ----- Explicit deterministic edge cases ----------------------------------
  it('resolve exactly at the deadline (resolveDelay === timeoutMs) settles to error', () => {
    const { afterFirst } = runRace(10_000, 10_000, 42)
    expect(afterFirst).toEqual({
      status: 'error',
      message: ASYNC_TIMEOUT_MESSAGE,
    })
  })

  it('resolve just before the deadline settles to success', () => {
    const { afterFirst } = runRace(9_999, 10_000, 42)
    expect(afterFirst).toEqual({ status: 'success', data: 42 })
  })

  it('a stale resolve after a timeout error is ignored (first-wins)', () => {
    let state = initialAsyncState<Payload>()
    state = asyncDataReducer(state, { type: 'reject', message: ASYNC_TIMEOUT_MESSAGE })
    state = asyncDataReducer(state, { type: 'resolve', data: 7 })
    expect(state).toEqual({ status: 'error', message: ASYNC_TIMEOUT_MESSAGE })
  })

  it('a stale timeout after a success is ignored (first-wins)', () => {
    let state = initialAsyncState<Payload>()
    state = asyncDataReducer(state, { type: 'resolve', data: 7 })
    state = asyncDataReducer(state, { type: 'reject', message: ASYNC_TIMEOUT_MESSAGE })
    expect(state).toEqual({ status: 'success', data: 7 })
  })
})
