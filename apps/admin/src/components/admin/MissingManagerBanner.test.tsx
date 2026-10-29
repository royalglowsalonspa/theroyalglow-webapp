/************************************************************
 * Module Name  : MissingManagerBanner.test
 * Scope        : Admin Portal — Dashboard (multi-branch R1.9)
 *
 * Description  : The banner names the branch, links Owners and the Developer
 *                to Users & Roles, tells everyone else who covers, and has no
 *                accessibility violations.
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it } from 'vitest'
import { MissingManagerBanner } from './MissingManagerBanner'

expect.extend(toHaveNoViolations)

afterEach(() => {
  cleanup()
})

describe('MissingManagerBanner', () => {
  it('links the Owner to Users & Roles', async () => {
    const { container } = render(
      <MissingManagerBanner notice={{ branchName: 'Marathahalli', canAssign: true }} />,
    )

    expect(screen.getByRole('heading', { name: 'Marathahalli has no Manager' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Assign a Manager' })).toHaveAttribute('href', '/users')
    expect(screen.getByText(/you cover the branch’s administration/)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('tells a Receptionist who covers, without a link', () => {
    render(<MissingManagerBanner notice={{ branchName: 'Marathahalli', canAssign: false }} />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/The branch Owner covers its administration/)).toBeInTheDocument()
  })
})
