'use client'

import { useState } from 'react'

/**
 * Props for the {@link Feedback} control.
 */
export type FeedbackProps = {
  /**
   * Optional page path used to tag the feedback submission (e.g. `/docs/v2/intro`).
   * Passed through to {@link FeedbackProps.onSubmit} via a closure by the caller
   * if needed; exposed here so the control can label/scope the response.
   */
  pagePath?: string
  /**
   * Fire-and-forget submission sink. Invoked with the chosen value when the
   * Reader submits. Defaults to a no-op. Any thrown error or rejected promise is
   * swallowed so it can never block or hide the acknowledgement (Req 14.6).
   */
  onSubmit?: (value: FeedbackValue) => void | Promise<void>
}

/**
 * The two possible feedback responses.
 */
export type FeedbackValue = 'good' | 'bad'

const noop = (): void => {}

/**
 * "Was this page helpful? Good / Bad" control (Req 14.5, 14.6, 14.7).
 *
 * On submit it shows an inline acknowledgement and does NOT navigate away. The
 * submission is fire-and-forget: {@link FeedbackProps.onSubmit} is awaited inside
 * a `try/catch` and the acknowledgement is shown regardless of success or
 * failure. Keyboard operable, AA contrast/focus (focus ring is provided globally
 * in `global.css`), and reduced-motion safe (opacity-only transition opted in via
 * `fd-allow-opacity`).
 */
export function Feedback({ pagePath, onSubmit = noop }: FeedbackProps) {
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(value: FeedbackValue): Promise<void> {
    // Show the acknowledgement immediately; submission is fire-and-forget and
    // must never block or hide it (Req 14.6).
    setSubmitted(true)

    try {
      await onSubmit(value)
    } catch {
      // Swallow: a failed submission must not affect the acknowledgement.
    }
  }

  return (
    <section
      aria-labelledby="fd-feedback-heading"
      className="not-prose fd-allow-opacity mt-8 rounded-[var(--radius)] border border-fd-border bg-fd-card p-4 text-fd-card-foreground"
      data-page-path={pagePath}
    >
      {submitted ? (
        <p aria-live="polite" className="text-sm font-medium text-fd-foreground">
          Thanks for your feedback
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-fd-foreground" id="fd-feedback-heading">
            Was this page helpful?
          </p>
          <div className="flex items-center gap-2">
            <button
              // The accessible name must CONTAIN the visible label ("Good"), otherwise
              // speech-input users cannot activate the control by saying what they see.
              aria-label="Good, this page was helpful"
              className="rounded-[var(--radius)] border border-fd-border bg-fd-secondary px-3 py-1.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
              onClick={() => {
                void handleSubmit('good')
              }}
              type="button"
            >
              Good
            </button>
            <button
              aria-label="Bad, this page was not helpful"
              className="rounded-[var(--radius)] border border-fd-border bg-fd-secondary px-3 py-1.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
              onClick={() => {
                void handleSubmit('bad')
              }}
              type="button"
            >
              Bad
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default Feedback
