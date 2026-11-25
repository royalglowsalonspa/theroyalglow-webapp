import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw/http'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsPanel } from '@/app/(customer)/notifications/notifications-panel'
import { server } from '@/test/msw-server'
import { useNotificationFeed } from './use-notification-feed'

function wireFeed(readAt: string | null = null) {
  return {
    success: true,
    data: {
      notifications: [
        {
          id: 'n_1',
          title: 'Booking confirmed',
          body: 'Your appointment is confirmed.',
          readAt,
          createdAt: '2026-11-25T10:00:00.000Z',
        },
      ],
      unreadCount: readAt === null ? 1 : 0,
    },
  }
}

describe('Customer notification feed', () => {
  it('keeps unread notifications retryable when marking fails', async () => {
    const readAt = '2026-11-25T10:01:00.000Z'
    let marked = false
    let attempts = 0
    server.use(
      http.get('*/api/notifications', () => HttpResponse.json(wireFeed(marked ? readAt : null))),
      http.patch('*/api/notifications', () => {
        attempts += 1
        if (attempts === 1) return new HttpResponse(null, { status: 503 })
        marked = true
        return HttpResponse.json({ success: true, data: { ok: true } })
      }),
    )
    render(<NotificationsPanel />)

    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark notifications')
    expect(screen.getByText('Booking confirmed')).toHaveClass('font-bold')
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(screen.getByText('Booking confirmed')).not.toHaveClass('font-bold'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores a poll snapshot started before a completed read update', async () => {
    const older = Promise.withResolvers<Response>()
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockResolvedValueOnce(Response.json(wireFeed()))
    fetch.mockReturnValueOnce(older.promise)
    fetch.mockResolvedValueOnce(Response.json({ success: true, data: { ok: true } }))
    fetch.mockResolvedValueOnce(Response.json(wireFeed('2026-11-25T10:01:00.000Z')))

    try {
      const { result } = renderHook(() => useNotificationFeed())
      await waitFor(() => expect(result.current.feed.snapshot?.unreadCount).toBe(1))

      act(() => {
        void result.current.refresh()
      })
      await act(async () => {
        await result.current.markAllRead()
      })
      await waitFor(() => expect(result.current.feed.snapshot?.unreadCount).toBe(0))
      await act(async () => {
        older.resolve(Response.json(wireFeed()))
      })

      expect(result.current.feed.snapshot?.unreadCount).toBe(0)
    } finally {
      fetch.mockRestore()
    }
  })
})
