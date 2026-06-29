import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageAffordances } from './page-affordances'

const SOURCE_URL = 'https://github.com/x/y/blob/prod/docs/content/docs/index.mdx'
const MARKDOWN = '# Hi'
const LAST_MODIFIED = new Date('2026-06-08')

// The component formats with `Intl.DateTimeFormat('en-IN', { day, month, year })`
// in the host timezone. Compute the expectation the same way so the assertion is
// timezone-robust while still proving the DD/MM/YYYY shape and correct value.
const EXPECTED_DATE = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(LAST_MODIFIED)

/**
 * Install a clipboard spy on `navigator.clipboard`. This MUST run after
 * `userEvent.setup()`, because user-event installs its own clipboard stub on
 * setup which would otherwise shadow the spy.
 */
function stubClipboard(impl: () => Promise<void>) {
  const writeText = vi.fn(impl)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAffordances() {
  return render(
    <PageAffordances
      lastModified={LAST_MODIFIED}
      markdownSource={MARKDOWN}
      sourceUrl={SOURCE_URL}
    />,
  )
}

describe('PageAffordances (task 7.7)', () => {
  it('copies the raw Markdown and shows a confirmation on success (Req 14.3)', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard(() => Promise.resolve())
    renderAffordances()

    await user.click(screen.getByRole('button', { name: /copy markdown/i }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(MARKDOWN)
    expect(await screen.findByText('Markdown copied to clipboard.')).toBeInTheDocument()
  })

  it('shows a failure indication and leaves the source unchanged when the copy rejects (Req 14.3, 2.6)', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard(() => Promise.reject(new Error('denied')))
    renderAffordances()

    await user.click(screen.getByRole('button', { name: /copy markdown/i }))

    expect(
      await screen.findByText('Could not copy to clipboard. The page content is unchanged.'),
    ).toBeInTheDocument()
    // The only value ever handed to the clipboard is the unchanged source; a
    // failure never mutates it.
    expect(writeText).toHaveBeenCalledWith(MARKDOWN)
  })

  it('renders the last-updated date in DD/MM/YYYY (Req 14.1)', () => {
    renderAffordances()
    const time = screen.getByText(EXPECTED_DATE)
    expect(time).toBeInTheDocument()
    expect(time.tagName).toBe('TIME')
    expect(EXPECTED_DATE).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('points the Open and Report-an-issue links at the page source URL (Req 14.2, 14.4)', () => {
    renderAffordances()
    const open = screen.getByRole('link', { name: /open/i })
    const report = screen.getByRole('link', { name: /report an issue/i })
    expect(open).toHaveAttribute('href', SOURCE_URL)
    expect(report).toHaveAttribute('href', SOURCE_URL)
  })
})
