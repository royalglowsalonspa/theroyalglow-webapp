/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 23-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/onboarding/complete
 * Scope        : API — Customer Onboarding
 *
 * Description  : Completes the post-OAuth onboarding flow by collecting the
 *                customer's name, phone, DOB, gender, and consent choices.
 *
 * Responsibilities :
 * - Validate onboarding payload (name, phone, DOB, gender, consents)
 * - Prevent duplicate profile creation (409 on existing)
 * - Save the name the customer confirmed or corrected to their account
 * - Persist customer_profile with acquisition source attribution, together
 *   with a consent receipt for the privacy, analytics, and marketing choices
 *
 * Features / Functionality :
 * - Indian phone validation (10-digit, starts with 6-9)
 * - UTM/lead-based acquisition source resolution
 * - Privacy Policy acceptance required; analytics and marketing optional
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/auth-server, @rgss/db/queries, next/headers, zod
 *
 * Notes        :
 * - Called once per user after first Google OAuth sign-in.
 * - Returns 409 if profile already exists (idempotency guard).
 * - The consent receipt is an audit_log row written in the same transaction as
 *   the profile; see OnboardingConsentReceipt in @rgss/types.
 ************************************************************/

import { createCustomerProfile, hasCustomerProfile } from '@rgss/db/queries'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth-server'

const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  dateOfBirth: z.string().date(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  privacyConsent: z.literal(true),
  analyticsConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
  utmSource: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmMedium: z.string().optional(),
  leadId: z.string().optional(),
})

function resolveAcquisitionSource(input: {
  leadId?: string | undefined
  utmSource?: string | undefined
}): string {
  if (input.leadId) return 'meta_ad'

  if (input.utmSource) {
    const sourceMap: Record<string, string> = {
      gmb: 'gmb',
      walkin: 'walkin',
    }
    return sourceMap[input.utmSource] ?? 'organic'
  }

  return 'organic'
}

export async function POST(request: Request) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 },
    )
  }

  const body = await request.json()
  const parsed = onboardingSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    )
  }

  if (await hasCustomerProfile(session.user.id)) {
    return Response.json(
      { success: false, error: { code: 'PROFILE_EXISTS', message: 'Profile already exists' } },
      { status: 409 },
    )
  }

  const data = parsed.data

  // The form pre-fills the Google account name and lets the customer correct
  // it, so keep what they confirmed. This runs BEFORE the profile insert: if it
  // fails, nothing has been created and a resubmit simply retries. Better Auth's
  // updateUser also re-issues the 5-minute session cookie cache; its Set-Cookie
  // headers are forwarded so the site shows the new name straight away.
  let refreshedSessionCookies: string[] = []
  if (data.name !== session.user.name) {
    const { headers: authHeaders } = await auth.api.updateUser({
      headers: requestHeaders,
      body: { name: data.name },
      returnHeaders: true,
    })
    refreshedSessionCookies = authHeaders.getSetCookie()
  }

  // One instant stamps every consent given in this submission.
  const consentedAt = new Date()
  const profile = await createCustomerProfile(
    {
      userId: session.user.id,
      phone: data.phone,
      gender: data.gender,
      dateOfBirth: new Date(data.dateOfBirth),
      marketingConsent: data.marketingConsent,
      marketingConsentAt: data.marketingConsent ? consentedAt : null,
      acquisitionSource: resolveAcquisitionSource({
        leadId: data.leadId,
        utmSource: data.utmSource,
      }),
      utmSource: data.utmSource ?? null,
      utmCampaign: data.utmCampaign ?? null,
      utmMedium: data.utmMedium ?? null,
    },
    {
      event: 'onboarding_consent',
      privacyPolicy: data.privacyConsent,
      analytics: data.analyticsConsent,
      marketing: data.marketingConsent,
    },
    consentedAt,
  )

  const response = Response.json(
    { success: true, data: { profileId: profile.id } },
    { status: 201 },
  )
  for (const cookie of refreshedSessionCookies) {
    response.headers.append('set-cookie', cookie)
  }
  return response
}
