import { z } from 'zod'
import { INVOICE_CALLBACK_TAG_NAME } from './delivery'
import type { InvoiceEnv } from './env'
import { recordResendEvent } from './resend-events'
import { readBodyBytes } from './signed-body'

const MAX_BODY_BYTES = 32 * 1024
const MAX_SIGNATURE_CHARS = 1024
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60
const opaqueId = /^[A-Za-z0-9_-]{1,128}$/
const envelope = z.object({ type: z.string().min(1) })
const deliveryEvent = z.object({
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.string().regex(opaqueId),
    tags: z
      .object({
        [INVOICE_CALLBACK_TAG_NAME]: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,256}$/)
          .nullish(),
      })
      .nullish(),
  }),
})
const statusByType = new Map(
  Object.entries({
    'email.sent': 'sent',
    'email.delivery_delayed': 'delayed',
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.failed': 'failed',
    'email.suppressed': 'suppressed',
    'email.complained': 'complained',
  } as const),
)

function signingKey(secret: string | undefined): Uint8Array<ArrayBuffer> | null {
  if (!secret?.startsWith('whsec_')) return null
  const encoded = secret.slice('whsec_'.length)
  if (encoded.length > 88 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null
  try {
    const bytes = Uint8Array.fromBase64(encoded)
    return bytes.length >= 24 && bytes.length <= 64 ? bytes : null
  } catch {
    return null
  }
}

export async function resendWebhook(request: Request, env: InvoiceEnv): Promise<Response> {
  const secret = signingKey(env.RESEND_WEBHOOK_SECRET)
  if (secret === null) return new Response(null, { status: 503 })

  const eventId = request.headers.get('svix-id') ?? ''
  const timestamp = request.headers.get('svix-timestamp') ?? ''
  const signature = request.headers.get('svix-signature') ?? ''
  if (
    !opaqueId.test(eventId) ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_SIGNATURE_AGE_SECONDS ||
    signature.length > MAX_SIGNATURE_CHARS
  ) {
    return new Response(null, { status: 401 })
  }
  const signatures = signature.split(/\s+/).filter((entry) => /^v1,[A-Za-z0-9+/]{43}=$/.test(entry))
  if (!signatures.length) return new Response(null, { status: 401 })

  let body: Uint8Array<ArrayBuffer> | null
  try {
    body = await readBodyBytes(request, MAX_BODY_BYTES)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (body === null) return new Response(null, { status: 413 })
  const prefix = new TextEncoder().encode(`${eventId}.${timestamp}.`)
  const signed = new Uint8Array(prefix.length + body.length)
  signed.set(prefix)
  signed.set(body, prefix.length)
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  let verified = false
  for (const entry of signatures) {
    const value = Uint8Array.fromBase64(entry.slice(3))
    if (await crypto.subtle.verify('HMAC', key, value, signed)) {
      verified = true
      break
    }
  }
  if (!verified) return new Response(null, { status: 401 })

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body))
  } catch {
    return new Response(null, { status: 400 })
  }
  const event = envelope.safeParse(payload)
  if (!event.success) return new Response(null, { status: 400 })
  const status = statusByType.get(event.data.type)
  if (!status) return new Response(null, { status: 200 })

  const delivery = deliveryEvent.safeParse(payload)
  if (!delivery.success) return new Response(null, { status: 400 })
  const { created_at: createdAt, data } = delivery.data
  await recordResendEvent(env.DB, {
    eventId,
    providerId: data.email_id,
    occurredAt: Date.parse(createdAt),
    status,
    callbackTag: data.tags?.[INVOICE_CALLBACK_TAG_NAME] ?? null,
  })
  return new Response(null, { status: 200 })
}
