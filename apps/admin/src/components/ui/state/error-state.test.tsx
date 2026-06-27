/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 10-06-2026 & Updated - 10-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : state/error-state.test
 * Scope        : Component tests for the error-state State_Presenter
 *
 * Description  : Vitest + @testing-library/react (+ jest-axe) component tests
 *                for the ErrorState presenter. Verifies it renders the failure
 *                message and a retry control (Req 12.3), invokes the onRetry
 *                callback when the retry control is activated (Req 12.4, 12.5),
 *                announces the failure assertively via role="alert" (Req 12.8),
 *                and has zero accessibility violations.
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (presentation primitive)
 *
 * Dependencies : @/components/ui/state/error-state
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. The presenter is
 *                stateless — re-requesting the data and the transition back to
 *                the loading state are owned by the caller's onRetry handler, so
 *                the contract under test is that activation fires onRetry
 *                (Req 12.4, 12.5).
 *
 * Requirements : 12.3, 12.4, 12.5, 12.8
 ************************************************************/

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorState } from '@/components/ui/state/error-state'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

describe('ErrorState rendering (Req 12.3, 12.8)', () => {
  it('renders the failure message and a retry control', () => {
    render(<ErrorState message="Could not load bookings." onRetry={() => {}} />)

    expect(screen.getByText('Could not load bookings.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('announces the error assertively via an alert live region (Req 12.8)', () => {
    render(<ErrorState message="Request timed out." onRetry={() => {}} />)

    // role="alert" is an assertive live region — assistive technology announces
    // the failure immediately. The message is the alert's content.
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Request timed out.')
  })
})

describe('ErrorState retry callback (Req 12.4, 12.5)', () => {
  it('invokes onRetry when the retry control is activated', () => {
    const onRetry = vi.fn()
    render(<ErrorState message="Network error." onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('invokes onRetry once per activation', () => {
    const onRetry = vi.fn()
    render(<ErrorState message="Network error." onRetry={onRetry} />)

    const retry = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(retry)
    fireEvent.click(retry)

    expect(onRetry).toHaveBeenCalledTimes(2)
  })
})

describe('ErrorState accessibility (Req 12.8)', () => {
  it('has zero accessibility violations', async () => {
    const { container } = render(<ErrorState message="Could not load data." onRetry={() => {}} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
