import { createLogger } from '@rgss/logger'

// Transactional email delivery provider (Resend).
//
// We read `RESEND_API_KEY` / `RESEND_FROM_EMAIL` straight from `process.env`
// (NOT from `@/env`) on purpose: `env.ts` types the key as required and would
// fail build-time validation when it is absent. Reading `process.env` directly
// behind a truthy guard lets the app build and run with no key configured
// (Property 10 — no-op + return false without config).
//
// `resend` is an optional, lazily imported dependency — it need not be
// installed until the key is provisioned, so a missing module simply yields a
// benign `false`. This helper NEVER throws to its caller (Property 9): any
// failure is caught, logged, and reported as `false`.

const logger = createLogger({
  service: 'web:notifications:email',
  environment: process.env.NODE_ENV ?? 'development',
})

const DEFAULT_FROM = 'Royal Glow <contact@theroyalglow.in>'

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
}

// Minimal slice of the optional `resend` module surface we rely on. Modeled
// locally so this file compiles without the package (or its types) installed.
type ResendSendPayload = {
  from: string
  to: string | string[]
  subject: string
  html: string
}

type ResendClient = {
  emails: {
    send(payload: ResendSendPayload): Promise<unknown>
  }
}

type ResendConstructor = new (apiKey: string) => ResendClient

function resolveResend(mod: unknown): ResendConstructor | null {
  if (typeof mod !== 'object' || mod === null) {
    return null
  }
  const candidate = mod as { Resend?: unknown; default?: { Resend?: unknown } }
  if (typeof candidate.Resend === 'function') {
    return candidate.Resend as ResendConstructor
  }
  if (candidate.default && typeof candidate.default.Resend === 'function') {
    return candidate.default.Resend as ResendConstructor
  }
  return null
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM

  // Not configured → no-op (Property 10). Nothing was sent.
  if (!apiKey) {
    logger.info('sendEmail skipped (RESEND_API_KEY not configured)', {
      subject: params.subject,
    })
    return false
  }

  try {
    // Lazy, catchable import keeps `resend` an optional dependency. Use a
    // non-literal specifier so the type checker does not require it installed.
    const mod: unknown = await import('resend' as string).catch(() => null)
    const Resend = resolveResend(mod)
    if (!Resend) {
      logger.debug('resend module unavailable; cannot deliver email')
      return false
    }

    const client = new Resend(apiKey)
    await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

    return true
  } catch (error) {
    // Never throw to the caller (Property 9).
    logger.error('sendEmail failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
