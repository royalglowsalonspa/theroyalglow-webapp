import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { RouteTransition } from './motion-presence'

afterEach(() => {
  vi.restoreAllMocks()
})

it('hydrates a reduced-motion route without replacing its server-rendered content', async () => {
  const page = (
    <RouteTransition routeKey="/leads">
      <h1>Leads</h1>
    </RouteTransition>
  )
  const container = document.createElement('div')
  container.innerHTML = renderToString(page)
  const originalHeading = container.querySelector('h1')
  expect(originalHeading).not.toBeNull()

  const readMediaQuery = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const media = readMediaQuery(query)
    return { ...media, matches: query === '(prefers-reduced-motion: reduce)' }
  })

  const reportHydrationError = vi.fn()
  const root = hydrateRoot(container, page, { onRecoverableError: reportHydrationError })
  try {
    await act(async () => {})
    expect(reportHydrationError).not.toHaveBeenCalled()
    expect(container.querySelector('h1')).toBe(originalHeading)
  } finally {
    await act(() => root.unmount())
  }
})
