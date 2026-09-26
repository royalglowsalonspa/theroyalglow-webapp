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

const socialMock = vi.hoisted(() =>
  vi.fn(async (_options: Record<string, unknown>): Promise<void> => undefined),
)
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
  socialMock.mockClear()
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
      newUserCallbackURL: '/onboarding',
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
})
