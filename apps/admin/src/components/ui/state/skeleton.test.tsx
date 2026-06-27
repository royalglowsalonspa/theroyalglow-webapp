/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 10-06-2026 & Updated - 10-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : state/skeleton.test
 * Scope        : Component tests for the loading-skeleton State_Presenter
 *
 * Description  : Vitest + @testing-library/react (+ jest-axe) component tests
 *                for the Skeleton loading presenter. Verifies the loading state
 *                is announced to assistive technology through a polite live
 *                region marked aria-busy (Req 12.7), and that the placeholder
 *                row count is clamped to [0, 10] (Req 12.1, supporting context
 *                for the live-region assertions).
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (presentation primitive)
 *
 * Dependencies : @/components/ui/state/skeleton
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. jest-axe matchers
 *                are registered locally via expect.extend(toHaveNoViolations).
 *
 * Requirements : 12.7
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it } from 'vitest'

import { Skeleton, skeletonRowCount } from '@/components/ui/state/skeleton'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

describe('Skeleton loading live region (Req 12.7)', () => {
  it('announces the loading state through a polite, busy live region', () => {
    render(<Skeleton rows={3} />)

    // The wrapper is the live region: polite + busy so assistive technology
    // announces "loading" without interrupting the user.
    const region = screen.getByText('Loading…').parentElement as HTMLElement
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveAttribute('aria-busy', 'true')
  })

  it('exposes the loading status as accessible (sr-only) content', () => {
    render(<Skeleton rows={2} />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('has zero accessibility violations', async () => {
    const { container } = render(<Skeleton rows={4} variant="card" />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('skeletonRowCount clamp (Req 12.1)', () => {
  it('floors negative expected-record counts to zero', () => {
    expect(skeletonRowCount(-5)).toBe(0)
  })

  it('passes through counts within range', () => {
    expect(skeletonRowCount(0)).toBe(0)
    expect(skeletonRowCount(7)).toBe(7)
  })

  it('caps counts above ten at the maximum of ten', () => {
    expect(skeletonRowCount(11)).toBe(10)
    expect(skeletonRowCount(1000)).toBe(10)
  })
})
