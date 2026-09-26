// @vitest-environment node
/************************************************************
 * Module Name  : onboarding/complete/route.test
 * Scope        : Unit tests for POST /api/onboarding/complete
 *
 * Description  : Pins what onboarding must save: the name the customer
 *                confirmed, the profile fields, and a consent receipt for the
 *                privacy, analytics and marketing choices. Before these tests
 *                the route validated the name and the privacy/analytics
 *                consents but silently dropped them.
 *
 * Approach     : Better Auth (`@/lib/auth-server`), `next/headers` and the
 *                query layer are mocked; the handler runs with a constructed
 *                Request. The receipt's atomic write is the query layer's job
 *                (createCustomerProfile batches both rows), so here we assert
 *                exactly what the route hands it.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
}))
const dbMocks = vi.hoisted(() => ({
  hasCustomerProfile: vi.fn(),
  createCustomerProfile: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ auth: { api: authMocks } }))
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ cookie: 'better-auth.session_token=t' })),
}))

import { POST } from './route'

const SESSION = { user: { id: 'user_1', name: 'Priya Sharma', email: 'priya@example.com' } }

const VALID_BODY = {
  name: 'Priya Sharma',
  phone: '9876543210',
  dateOfBirth: '1995-04-12',
  gender: 'female',
  privacyConsent: true,
  analyticsConsent: true,
  marketingConsent: false,
  utmSource: 'walkin',
}

function post(body: unknown): Request {
  return new Request('https://theroyalglow.in/api/onboarding/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

type CreateArgs = [
  Record<string, unknown>,
  { event: string; privacyPolicy: boolean; analytics: boolean; marketing: boolean },
  Date,
]

function createArgs(): CreateArgs {
  const call = dbMocks.createCustomerProfile.mock.calls[0]
  if (!call) throw new Error('createCustomerProfile was not called')
  return call as CreateArgs
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.getSession.mockResolvedValue(SESSION)
  authMocks.updateUser.mockResolvedValue({
    headers: new Headers([
      ['set-cookie', 'better-auth.session_data=fresh; Path=/; HttpOnly'],
      ['set-cookie', 'better-auth.session_token=t; Path=/; HttpOnly'],
    ]),
    response: { status: true },
  })
  dbMocks.hasCustomerProfile.mockResolvedValue(false)
  dbMocks.createCustomerProfile.mockResolvedValue({ id: 'profile_1' })
})

describe('POST /api/onboarding/complete', () => {
  it('rejects an unauthenticated request without touching the database', async () => {
    authMocks.getSession.mockResolvedValue(null)

    const res = await POST(post(VALID_BODY))

    expect(res.status).toBe(401)
    expect(dbMocks.hasCustomerProfile).not.toHaveBeenCalled()
    expect(dbMocks.createCustomerProfile).not.toHaveBeenCalled()
  })

  it.each([
    ['declined', { ...VALID_BODY, privacyConsent: false }],
    ['missing', { ...VALID_BODY, privacyConsent: undefined }],
  ])('refuses to finish when Privacy Policy acceptance is %s', async (_label, body) => {
    const res = await POST(post(body))

    expect(res.status).toBe(400)
    expect(dbMocks.createCustomerProfile).not.toHaveBeenCalled()
    expect(authMocks.updateUser).not.toHaveBeenCalled()
  })

  it('answers 409 and changes nothing when the profile already exists', async () => {
    dbMocks.hasCustomerProfile.mockResolvedValue(true)

    const res = await POST(post({ ...VALID_BODY, name: 'Someone Else' }))

    expect(res.status).toBe(409)
    expect(authMocks.updateUser).not.toHaveBeenCalled()
    expect(dbMocks.createCustomerProfile).not.toHaveBeenCalled()
  })

  it('saves the profile with a consent receipt for every choice', async () => {
    const res = await POST(post(VALID_BODY))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ success: true, data: { profileId: 'profile_1' } })

    const [profile, receipt, consentedAt] = createArgs()
    expect(receipt).toEqual({
      event: 'onboarding_consent',
      privacyPolicy: true,
      analytics: true,
      marketing: false,
    })
    expect(consentedAt).toBeInstanceOf(Date)
    expect(profile).toMatchObject({
      userId: 'user_1',
      phone: '9876543210',
      gender: 'female',
      marketingConsent: false,
      marketingConsentAt: null,
      acquisitionSource: 'walkin',
      utmSource: 'walkin',
    })
    expect(profile.dateOfBirth).toEqual(new Date('1995-04-12'))
  })

  it('stamps marketing consent with the same instant as the receipt', async () => {
    await POST(post({ ...VALID_BODY, marketingConsent: true }))

    const [profile, receipt, consentedAt] = createArgs()
    expect(receipt.marketing).toBe(true)
    expect(profile.marketingConsent).toBe(true)
    expect(profile.marketingConsentAt).toBe(consentedAt)
  })

  it('treats omitted optional consents as declined', async () => {
    await POST(post({ ...VALID_BODY, analyticsConsent: undefined, marketingConsent: undefined }))

    const [profile, receipt] = createArgs()
    expect(receipt).toMatchObject({ privacyPolicy: true, analytics: false, marketing: false })
    expect(profile.marketingConsentAt).toBeNull()
  })

  it('saves a corrected name and forwards the refreshed session cookies', async () => {
    const res = await POST(post({ ...VALID_BODY, name: '  Priya S. Rao  ' }))

    expect(res.status).toBe(201)
    expect(authMocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'Priya S. Rao' }, returnHeaders: true }),
    )
    // The name is saved before the profile, so a failure there creates nothing.
    const updateOrder = authMocks.updateUser.mock.invocationCallOrder[0] ?? 0
    const createOrder = dbMocks.createCustomerProfile.mock.invocationCallOrder[0] ?? 0
    expect(updateOrder).toBeLessThan(createOrder)
    expect(res.headers.getSetCookie()).toEqual([
      'better-auth.session_data=fresh; Path=/; HttpOnly',
      'better-auth.session_token=t; Path=/; HttpOnly',
    ])
  })

  it('leaves the account alone when the name is unchanged', async () => {
    const res = await POST(post(VALID_BODY))

    expect(res.status).toBe(201)
    expect(authMocks.updateUser).not.toHaveBeenCalled()
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('creates no profile when saving the name fails', async () => {
    authMocks.updateUser.mockRejectedValue(new Error('auth store unavailable'))

    await expect(POST(post({ ...VALID_BODY, name: 'Priya Rao' }))).rejects.toThrow(
      'auth store unavailable',
    )
    expect(dbMocks.createCustomerProfile).not.toHaveBeenCalled()
  })
})
