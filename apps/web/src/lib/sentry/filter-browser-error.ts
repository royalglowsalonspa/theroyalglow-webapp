import type { ErrorEvent } from '@sentry/nextjs'

// RGSS-WEB-4 came entirely from an injected inpage.js script. Keep genuine
// application errors even when an injected script appears somewhere in their stack.
export function filterBrowserError(event: ErrorEvent): ErrorEvent | null {
  const exceptions = event.exception?.values
  const error = exceptions?.[0]
  const frames = error?.stacktrace?.frames

  if (
    exceptions?.length === 1 &&
    error?.type === 'Error' &&
    error.value === 'func sseError not found' &&
    error.mechanism?.type === 'auto.browser.global_handlers.onunhandledrejection' &&
    frames?.length &&
    frames.every((frame) =>
      /^(?:app:\/\/\/|https:\/\/(?:www\.)?theroyalglow\.in\/|(?:chrome|moz)-extension:\/\/[^/]+\/)?inpage\.js$/.test(
        frame.filename ?? '',
      ),
    )
  ) {
    return null
  }

  return event
}
