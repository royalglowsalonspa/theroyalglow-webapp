/************************************************************
 * Module Name  : SettlementCard (component test)
 * Scope        : Admin Portal — Reports, memberships and gems across branches
 *                (multi-branch R10)
 *
 * Description  : The branch's Owner and the Developer see the session time
 *                and gems with their value, what the branch is owed and owes,
 *                and a link to the statements. A Manager sees the time and
 *                gems only, told the amounts are for the Owner and the
 *                Developer. minutesText writes minutes as hours and minutes,
 *                negative after a correction. No accessibility violations.
 ************************************************************/

import type { BranchSettlementReport } from '@rgss/types'
import { cleanup, render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it } from 'vitest'
import { minutesText, SettlementCard } from './reports-dashboard'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

const WITH_MONEY: BranchSettlementReport = {
  memberships: {
    deliveredMinutes: 150,
    deliveredValuePaise: 312500,
    ownMembersMinutes: 60,
    ownMembersValuePaise: 125000,
    toReceivePaise: 250000,
    toPayPaise: 62500,
  },
  gems: { issued: 412, redeemed: 25, toReceivePaise: 1500, toPayPaise: 2000 },
}

const MINUTES_AND_GEMS_ONLY: BranchSettlementReport = {
  memberships: {
    deliveredMinutes: 150,
    deliveredValuePaise: null,
    ownMembersMinutes: 60,
    ownMembersValuePaise: null,
    toReceivePaise: null,
    toPayPaise: null,
  },
  gems: { issued: 412, redeemed: 25, toReceivePaise: null, toPayPaise: null },
}

/** The value a definition list gives a term. */
function definitionOf(container: HTMLElement, term: string): string | null {
  const dt = within(container).getByText(term, { selector: 'dt' })
  return dt.nextElementSibling?.textContent ?? null
}

/** The figures under one of the card's headings. */
function groupOf(card: HTMLElement, heading: 'Memberships' | 'Gems'): HTMLElement {
  const h4 = within(card).getByText(heading, { selector: 'h4' })
  if (!h4.parentElement) {
    throw new Error(`no group for ${heading}`)
  }
  return h4.parentElement
}

describe('SettlementCard', () => {
  it("shows the branch's Owner the time, gems and money, with the statements", async () => {
    const { container } = render(<SettlementCard report={WITH_MONEY} />)

    const card = screen.getByRole('region', { name: 'Memberships and gems across branches' })
    expect(definitionOf(card, 'Session time delivered here')).toBe('2 h 30 min')
    expect(definitionOf(card, 'Value delivered here')).toBe('₹3,125.00')
    expect(definitionOf(card, 'Time used by members sold here')).toBe('1 h')
    expect(definitionOf(card, 'Value used by members sold here')).toBe('₹1,250.00')
    expect(definitionOf(card, 'Gems issued here')).toBe('412')
    expect(definitionOf(card, 'Gems redeemed here')).toBe('25')

    const memberships = groupOf(card, 'Memberships')
    const gems = groupOf(card, 'Gems')
    expect(definitionOf(memberships, 'To receive')).toBe('₹2,500.00')
    expect(definitionOf(memberships, 'To pay')).toBe('₹625.00')
    expect(definitionOf(gems, 'To receive')).toBe('₹15.00')
    expect(definitionOf(gems, 'To pay')).toBe('₹20.00')

    expect(within(card).getByRole('link', { name: 'Statements →' })).toHaveAttribute(
      'href',
      '/settlements',
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows a Manager the time and gems, without the money', async () => {
    const { container } = render(<SettlementCard report={MINUTES_AND_GEMS_ONLY} />)

    const card = screen.getByRole('region', { name: 'Memberships and gems across branches' })
    expect(definitionOf(card, 'Session time delivered here')).toBe('2 h 30 min')
    expect(definitionOf(card, 'Gems issued here')).toBe('412')
    for (const term of [
      'Value delivered here',
      'Value used by members sold here',
      'To receive',
      'To pay',
    ]) {
      expect(within(card).queryByText(term)).toBeNull()
    }
    expect(within(card).queryByText(/₹/)).toBeNull()
    expect(within(card).queryByRole('link')).toBeNull()
    expect(
      within(card).getByText("Amounts are for the branch's Owner and the Developer."),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('minutesText', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [600, '10 h'],
    [-90, '−1 h 30 min'],
    [-15, '−15 min'],
  ])('writes %i minutes as %s', (minutes, text) => {
    expect(minutesText(minutes)).toBe(text)
  })
})
