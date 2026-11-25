/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : google-signin.test
 * Scope        : Authentication — new-user routing into onboarding
 *
 * Description  : Regression tests for the bug where a brand-new customer was
 *                never shown /onboarding.
 *
 *                Better Auth picks the post-OAuth target with
 *                `isRegister ? newUserURL || callbackURL : callbackURL`
 *                (better-auth/dist/api/routes/callback.mjs). Passing no
 *                newUserCallbackURL therefore sent first-time users to `/`,
 *                which deliberately mounts NO onboarding gate — so nothing ever
 *                prompted them and no customer_profile row was created.
 *
 *                These tests pin the contract that actually routes a new user
 *                into onboarding. Nothing previously covered the post-OAuth
 *                landing target, which is how the gap shipped.
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

type SocialOptions = Record<string, unknown>
type SocialResult =
  | { data: { redirect: boolean; url?: string }; error: null }
  | { data: null; error: { message: string } }

const socialMock = vi.hoisted(() => vi.fn<(options: SocialOptions) => Promise<SocialResult>>())
vi.mock('@/lib/auth-client', () => ({ signIn: { social: socialMock } }))

import { NEW_USER_CALLBACK_URL, startGoogleSignIn } from './google-signin'

/** The single argument object handed to Better Auth's signIn.social. */
function socialCallArg(): SocialOptions {
  expect(socialMock).toHaveBeenCalledTimes(1)
  const [options] = socialMock.mock.calls[0] ?? []
  if (options === undefined) {
    throw new Error('signIn.social was called without an options object')
  }
  return options
}

beforeEach(() => {
  socialMock.mockReset().mockResolvedValue({
    data: { redirect: true, url: 'https://accounts.google.com/' },
    error: null,
  })
  sessionStorage.clear()
})

describe('startGoogleSignIn — first-time registrations reach /onboarding', () => {
  it('always sends newUserCallbackURL so a new user lands on the onboarding form', async () => {
    await startGoogleSignIn()

    expect(socialCallArg()).toMatchObject({
      provider: 'google',
      newUserCallbackURL: '/onboarding',
    })
  })

  it('keeps newUserCallbackURL even when a caller supplies its own callbackURL', async () => {
    // BookingDialog passes '/?book=1'. A RETURNING user must still land there,
    // but a NEW user has to be onboarded first — both targets must be present
    // for Better Auth to be able to choose between them.
    await startGoogleSignIn('/?book=1')

    expect(socialCallArg()).toMatchObject({
      provider: 'google',
      callbackURL: '/?book=1',
      newUserCallbackURL: '/onboarding?book=1',
    })
  })

  it('omits callbackURL entirely when none is given, rather than sending undefined', async () => {
    await startGoogleSignIn()

    expect(socialCallArg()).not.toHaveProperty('callbackURL')
  })

  it('exports the onboarding path in sync with the guard', () => {
    // onboarding-guard.ts owns ONBOARDING_PATH but pulls in the DB client, so it
    // cannot be imported here. Assert the literal instead.
    expect(NEW_USER_CALLBACK_URL).toBe('/onboarding')
  })

  it('reports a Better Auth error as a failed redirect', async () => {
    socialMock.mockResolvedValueOnce({ data: null, error: { message: 'provider unavailable' } })

    await expect(startGoogleSignIn()).rejects.toThrow('Google sign-in could not start')
  })

  it('reports a successful response with no redirect as a failed redirect', async () => {
    socialMock.mockResolvedValueOnce({ data: { redirect: false }, error: null })

    await expect(startGoogleSignIn()).rejects.toThrow('Google sign-in could not start')
  })
})

describe('startGoogleSignIn — context kept across the OAuth redirect', () => {
  it('still starts the OAuth redirect when optional browser storage is blocked', async () => {
    window.history.replaceState(null, '', '/?book=1')
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage is blocked', 'SecurityError')
    })
    try {
      await startGoogleSignIn('/?book=1')
      expect(socialCallArg()).toMatchObject({
        callbackURL: '/?book=1',
        newUserCallbackURL: '/onboarding?book=1',
      })
    } finally {
      write.mockRestore()
      window.history.replaceState(null, '', '/')
    }
  })

  it('saves the booking and acquisition parameters from the URL, and no others', async () => {
    window.history.replaceState(
      null,
      '',
      '/?book=1&utm_source=gmb&leadId=lead_9&service=signature-haircut&fbclid=abc&ref=x',
    )
    try {
      await startGoogleSignIn('/?book=1')

      expect(JSON.parse(sessionStorage.getItem('rgss_auth_context') ?? 'null')).toEqual({
        book: '1',
        utm_source: 'gmb',
        leadId: 'lead_9',
        service: 'signature-haircut',
      })
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('saves nothing when the URL carries no context', async () => {
    window.history.replaceState(null, '', '/?fbclid=abc')
    try {
      await startGoogleSignIn()

      expect(sessionStorage.getItem('rgss_auth_context')).toBeNull()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})
