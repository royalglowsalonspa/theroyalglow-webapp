import { headers } from 'next/headers'
import { auth } from '@/lib/auth-server'
import { db } from '@rgss/db'
import { customerProfile } from '@rgss/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

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

  const profile = result[0]!

  return Response.json(
    { success: true, data: { profileId: profile.id } },
    { status: 201 },
  )
}
