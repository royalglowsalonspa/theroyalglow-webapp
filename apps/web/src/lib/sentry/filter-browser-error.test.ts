import type { ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'
import { filterBrowserError } from './filter-browser-error'

function rejection(message: string, filenames: string[]): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [
        {
          type: 'Error',
          value: message,
          mechanism: { type: 'auto.browser.global_handlers.onunhandledrejection', handled: false },
          stacktrace: { frames: filenames.map((filename) => ({ filename })) },
        },
      ],
    },
  }
}

describe('filterBrowserError', () => {
  it('ignores the observed injected-script rejection', () => {
    const event = rejection('func sseError not found', ['app:///inpage.js', 'app:///inpage.js'])

    expect(filterBrowserError(event)).toBeNull()
  })

  it('keeps the same message when the stack also has application code', () => {
    const event = rejection('func sseError not found', [
      'app:///inpage.js',
      'app:///_next/static/chunks/app.js',
    ])

    expect(filterBrowserError(event)).toBe(event)
  })

  it('keeps other messages and events without stack evidence', () => {
    const anotherError = rejection('an unknown error', ['app:///inpage.js'])
    const noStack = rejection('func sseError not found', [])

    expect(filterBrowserError(anotherError)).toBe(anotherError)
    expect(filterBrowserError(noStack)).toBe(noStack)
  })
})
