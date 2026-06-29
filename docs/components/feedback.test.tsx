import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Feedback } from './feedback'

describe('Feedback (task 7.6)', () => {
  it('shows the acknowledgement and hides the buttons after submitting, without navigating (Req 14.6)', async () => {
    const user = userEvent.setup()
    // The control performs no navigation of its own; capture the initial href so
    // we can assert it is untouched after submitting.
    const hrefBefore = window.location.href

    render(<Feedback />)

    await user.click(screen.getByRole('button', { name: 'Yes, this page was helpful' }))

    expect(screen.getByText('Thanks for your feedback')).toBeInTheDocument()
    // Buttons are replaced by the acknowledgement.
    expect(
      screen.queryByRole('button', { name: 'Yes, this page was helpful' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'No, this page was not helpful' }),
    ).not.toBeInTheDocument()
    // No navigation occurred.
    expect(window.location.href).toBe(hrefBefore)
  })

  it('still acknowledges when the submission rejects (fire-and-forget, Req 14.6)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('network down'))

    render(<Feedback onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'No, this page was not helpful' }))

    // The rejected promise is swallowed; the acknowledgement appears regardless.
    expect(await screen.findByText('Thanks for your feedback')).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith('bad')
  })
})
