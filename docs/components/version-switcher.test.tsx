import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SwitcherVersion, VersionSwitcher } from './version-switcher'

// The switcher navigates via `next/navigation` `useRouter().push`. Mock the
// module with a hoisted push spy so selection changes can be asserted without a
// real App Router. `vi.hoisted` is required because `vi.mock` is hoisted above
// the top-level bindings it would otherwise reference.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Most-recent-first ordering: Latest first, then legacy v2 (Req 7.2).
const latest: SwitcherVersion = {
  id: 'latest',
  label: 'Latest',
  versionNumber: null,
  basePath: '/docs',
  isLatest: true,
}
const v2: SwitcherVersion = {
  id: 'v2',
  label: 'v2',
  versionNumber: 2,
  basePath: '/docs/v2',
  isLatest: false,
}

const targetHrefByVersionId = {
  latest: '/docs/getting-started',
  v2: '/docs/v2/getting-started',
}

function renderSwitcher() {
  return render(
    <VersionSwitcher
      activeVersionId="v2"
      targetHrefByVersionId={targetHrefByVersionId}
      versions={[latest, v2]}
    />,
  )
}

describe('VersionSwitcher (task 7.5)', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('renders the native select control carrying the Req 7.5 aria-label', () => {
    renderSwitcher()
    // The control is the single native <select> (implicit ARIA role combobox).
    const select = screen.getByRole('combobox')
    // Req 7.5 mandates aria-label="Select documentation version" on the control;
    // assert the attribute is present on the select.
    expect(select).toHaveAttribute('aria-label', 'Select documentation version')

    // NOTE (flagged component a11y smell, not changed here): the select ALSO
    // carries aria-labelledby pointing at the visible "Documentation version"
    // span. Per the accessible-name precedence (aria-labelledby > aria-label),
    // the computed accessible name resolves to the span text, NOT the Req 7.5
    // aria-label. The two labels are redundant/conflicting.
    expect(select).toHaveAccessibleName('Documentation version')
  })

  it('marks the active version (v2) as the selected option (Req 7.1)', () => {
    renderSwitcher()
    expect(screen.getByRole('combobox')).toHaveValue('v2')
  })

  it('lists every version as an option in most-recent-first order (Req 7.2)', () => {
    renderSwitcher()
    const options = screen.getAllByRole('option') as HTMLOptionElement[]
    expect(options).toHaveLength(2)
    expect(options.map((option) => option.value)).toEqual(['latest', 'v2'])
    expect(options.map((option) => option.textContent)).toEqual(['Latest', 'v2'])
  })

  it('navigates to the mapped target href when the selection changes (Req 7.3)', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    const select = screen.getByRole('combobox')

    await user.selectOptions(select, 'latest')

    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith(targetHrefByVersionId.latest)
  })
})
