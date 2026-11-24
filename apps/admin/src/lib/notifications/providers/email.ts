/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : email (admin)
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
 * - sendEmail({ to, subject, html }) — async boolean delivery
 * - Lazy Resend import
 * - Configurable from address via RESEND_FROM_EMAIL
 *
 * Tech Stack   : TypeScript, Resend (optional)
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger, resend
 *
 * Notes        : Reads process.env directly for graceful degradation
 ************************************************************/

import { createLogger } from '@rgss/logger'

// Transactional email delivery provider (Resend).
//
// We read `RESEND_API_KEY` / `RESEND_FROM_EMAIL` straight from `process.env`
// (NOT from `@/env`) on purpose: `env.ts` types the key as required and would
// fail build-time validation when it is absent. Reading `process.env` directly
// behind a truthy guard lets the app build and run with no key configured.
//
// The provider is loaded only when a key is present. Delivery failures are
// logged and reported as `false`.

const logger = createLogger({
  service: 'admin:notifications:email',
  environment: process.env.NODE_ENV ?? 'development',
})

const DEFAULT_FROM = 'Royal Glow <contact@theroyalglow.in>'

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  attachments?: { filename: string; content: string }[]
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM

  // Not configured → no-op. Nothing was sent.
  if (!apiKey) {
    logger.info('sendEmail skipped (RESEND_API_KEY not configured)', {
      subject: params.subject,
    })
    return false
  }

  try {
    const { Resend } = await import('resend')
    const client = new Resend(apiKey)
    const { error } = await client.emails.send({ ...params, from })
    if (error) {
      logger.warn('Resend rejected the email', { name: error.name })
      return false
    }
    return true
  } catch (error) {
    // Never throw to the caller.
    logger.error('sendEmail failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
