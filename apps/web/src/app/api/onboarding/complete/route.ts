/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/onboarding/complete
 * Scope        : API — Customer Onboarding
 *
 * Description  : Completes the post-OAuth onboarding flow by collecting the
 *                customer's phone, DOB, gender, and consent preferences.
 *
 * Responsibilities :
 * - Validate onboarding payload (phone, DOB, gender, consents)
 * - Prevent duplicate profile creation (409 on existing)
 * - Persist customer_profile with acquisition source attribution
 *
 * Features / Functionality :
 * - Indian phone validation (10-digit, starts with 6-9)
 * - UTM/lead-based acquisition source resolution
 * - Marketing, analytics, and privacy consent capture
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/auth-server, @rgss/db, @rgss/db/schema, drizzle-orm,
 *                next/headers, zod
 *
 * Notes        :
 * - Called once per user after first Google OAuth sign-in.
 * - Returns 409 if profile already exists (idempotency guard).
 ************************************************************/

import { db } from '@rgss/db'
import { customerProfile } from '@rgss/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth-server'

const onboardingSchema = z.object({
  name: z.string().min(2).max(100),
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
  const session = await auth.api.getSession({
    headers: await headers(),
  })

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

  // Check if profile already exists
  const existing = await db
    .select({ id: customerProfile.id })
    .from(customerProfile)
    .where(eq(customerProfile.userId, session.user.id))
    .limit(1)

  if (existing.length > 0) {
    return Response.json(
      { success: false, error: { code: 'PROFILE_EXISTS', message: 'Profile already exists' } },
      { status: 409 },
    )
  }

  const data = parsed.data
  const acquisitionSource = resolveAcquisitionSource({
    leadId: data.leadId,
    utmSource: data.utmSource,
  })

  const result = await db
    .insert(customerProfile)
    .values({
      userId: session.user.id,
      phone: data.phone,
      gender: data.gender,
      dateOfBirth: new Date(data.dateOfBirth),
      marketingConsent: data.marketingConsent,
      marketingConsentAt: data.marketingConsent ? new Date() : null,
      acquisitionSource,
      utmSource: data.utmSource ?? null,
      utmCampaign: data.utmCampaign ?? null,
      utmMedium: data.utmMedium ?? null,
    })
    .returning({ id: customerProfile.id })

  const profile = result[0]
  if (!profile) {
    throw new Error('Profile insert returned no rows.')
  }

  return Response.json({ success: true, data: { profileId: profile.id } }, { status: 201 })
}
