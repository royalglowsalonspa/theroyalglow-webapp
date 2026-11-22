/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : email
 * Scope        : Notifications — Email
 *
 * Description  : Transactional email delivery provider via Resend.
 *                No-op when the provider API key is absent.
 *
 * Responsibilities :
 * - Send transactional emails via Resend API
 * - No-op gracefully when RESEND_API_KEY is not configured
 * - Never throw to caller (return false on failure)
 *
 * Features / Functionality :
 * - sendEmail({ to, subject, html, replyTo? }) — async boolean delivery
 * - Configurable from address via RESEND_FROM_EMAIL
 *
 * Tech Stack   : TypeScript, Resend API
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger
 *
 * Notes        : Reads process.env directly for graceful degradation
 ************************************************************/

import { createLogger } from '@rgss/logger'

// Transactional email delivery provider (Resend).
//
// We read `RESEND_API_KEY` / `RESEND_FROM_EMAIL` straight from `process.env`
// (NOT from `@/env`) on purpose: `env.ts` types the key as required and would
// fail build-time validation when it is absent. Reading `process.env` directly
// behind a truthy guard lets the app build and run with no key configured
// (Property 10 — no-op + return false without config).

const logger = createLogger({
  service: 'web:notifications:email',
  environment: process.env.NODE_ENV ?? 'development',
})

const DEFAULT_FROM = 'Royal Glow <contact@theroyalglow.in>'
const RESEND_EMAIL_URL = 'https://api.resend.com/emails'

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  // Optional Reply-To. When set, a recipient's reply is routed here instead of
  // the `from` address — e.g. the contact form sends FROM our verified domain
  // but routes replies back to the customer who submitted the enquiry.
  replyTo?: string | string[]
  // Optional file attachments (e.g. the GST invoice PDF). Resend accepts a
  // base64-encoded `content` string per attachment. Only forwarded when present
  // so the payload stays minimal for ordinary text emails.
  attachments?: { filename: string; content: string }[]
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM

  // Not configured → no-op (Property 10). Nothing was sent.
  if (!apiKey) {
    logger.info('sendEmail skipped (RESEND_API_KEY not configured)')
    return false
  }

  try {
    const { replyTo, attachments, ...email } = params
    const response = await fetch(RESEND_EMAIL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...email,
        from,
        reply_to: replyTo,
        attachments: attachments?.length ? attachments : undefined,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      logger.warn('Resend rejected the email', { status: response.status })
    }
    return response.ok
  } catch (error) {
    // Never throw to the caller (Property 9).
    logger.error('sendEmail failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
