// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUSINESS } from '@/lib/seo/business'

const mocks = vi.hoisted(() => ({ getBranchById: vi.fn(), sendEmail: vi.fn() }))
vi.mock('@rgss/db/queries', () => ({ getBranchById: mocks.getBranchById }))
vi.mock('@/lib/api/rate-limit', () => ({
  enforceRateLimit: vi.fn(),
  getClientIp: vi.fn(() => 'unknown'),
}))
vi.mock('@/lib/notifications/providers/email', () => ({ sendEmail: mocks.sendEmail }))

import { POST } from './route'

const enquiry = {
  name: 'Test Customer',
  email: 'customer@example.com',
  message: 'I would like more information about your services.',
}
const mainInbox = process.env.CONTACT_INBOX_EMAIL ?? BUSINESS.email

function post(branchId?: unknown, idempotencyKey?: string) {
  return POST(
    new Request('https://theroyalglow.in/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ ...enquiry, branchId }),
    }),
    undefined,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getBranchById.mockResolvedValue(null)
  mocks.sendEmail.mockResolvedValue(true)
})

describe('POST /api/contact branch routing', () => {
  it('sends an enquiry to the selected branch’s stored email and names it in the subject', async () => {
    mocks.getBranchById.mockResolvedValue({
      name: 'Indiranagar',
      status: 'operational',
      email: 'indiranagar@example.com',
    })

    expect((await post('branch_indiranagar')).status).toBe(201)

    expect(mocks.getBranchById).toHaveBeenCalledExactlyOnceWith('branch_indiranagar')
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'indiranagar@example.com',
        subject: 'New contact enquiry from Test Customer · Indiranagar',
        replyTo: enquiry.email,
      }),
    )
  })

  it('includes the selected branch in the subject when routing to the main inbox', async () => {
    mocks.getBranchById.mockResolvedValue({
      name: 'Indiranagar',
      status: 'opens_soon',
      email: null,
    })

    expect((await post('branch_indiranagar')).status).toBe(201)

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: mainInbox,
        subject: 'New contact enquiry from Test Customer · Indiranagar',
      }),
    )
  })

  it.each([
    ['unknown', null],
    ['shut down', { name: 'Indiranagar', status: 'shutdown', email: 'closed@example.com' }],
  ])('falls back to the main inbox for a %s branch', async (_label, branch) => {
    mocks.getBranchById.mockResolvedValue(branch)

    expect((await post('branch_indiranagar')).status).toBe(201)

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: mainInbox, subject: 'New contact enquiry from Test Customer' }),
    )
  })

  it('still accepts a general enquiry without a branch lookup', async () => {
    expect((await post()).status).toBe(201)

    expect(mocks.getBranchById).not.toHaveBeenCalled()
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: mainInbox }))
  })

  it('validates the branch id before attempting lookup or email delivery', async () => {
    expect((await post({ id: 'branch_indiranagar' })).status).toBe(400)

    expect(mocks.getBranchById).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('returns a retryable failure if the provider declines or throws', async () => {
    mocks.sendEmail.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Network error'))

    for (const response of [await post(), await post()]) {
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
      })
    }
  })

  it('rejects invalid retry keys and forwards valid ones in the contact namespace', async () => {
    expect((await post(undefined, 'invalid')).status).toBe(400)
    expect(mocks.sendEmail).not.toHaveBeenCalled()

    const key = '44127296-858b-407d-b95e-c4a808297446'
    expect((await post(undefined, key)).status).toBe(201)
    expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ to: mainInbox }),
      `contact/${key}`,
    )
  })
})
