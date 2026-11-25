// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './email'

const message = {
  to: 'branch@example.test',
  subject: 'Branch enquiry',
  html: '<p>Test enquiry</p>',
  replyTo: 'customer@example.test',
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'salon@example.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('sendEmail', () => {
  it('sends the branch enquiry and its reply address through Resend', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'email_test' }))

    expect(await sendEmail(message)).toBe(true)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer re_test_key', 'Content-Type': 'application/json' },
      }),
    )
    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual({
      to: message.to,
      subject: message.subject,
      html: message.html,
      from: 'salon@example.test',
      reply_to: message.replyTo,
    })
  })

  it('reports provider rejection without throwing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 422 }))
    expect(await sendEmail(message)).toBe(false)
  })

  it('forwards the idempotency key as a header only', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'email_test' }))

    expect(await sendEmail(message, 'contact/transaction-id')).toBe(true)
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.headers).toMatchObject({ 'Idempotency-Key': 'contact/transaction-id' })
    expect(JSON.parse(String(request?.body))).not.toHaveProperty('idempotencyKey')
  })

  it('skips delivery when the provider is unconfigured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await sendEmail(message)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
