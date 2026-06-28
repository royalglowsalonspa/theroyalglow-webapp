/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : slack
 * Scope        : Reports — Slack
 *
 * Description  : Slack incoming webhook poster for daily/weekly report jobs.
 *                Best-effort delivery that never fails the calling job.
 *
 * Responsibilities :
 * - Post report messages to Slack via incoming webhook
 * - No-op when SLACK_WEBHOOK_URL is not configured
 * - Never throw — delivery failure is logged and returns false
 *
 * Features / Functionality :
 * - postToSlack(text) — async boolean webhook post
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger
 *
 * Notes        : Reads process.env directly (optional key)
 ************************************************************/

import { createLogger } from '@rgss/logger'

// Slack incoming-webhook poster for the daily/weekly report jobs.
//
// We read `SLACK_WEBHOOK_URL` straight from `process.env` (NOT from `@/env`) so
// the app builds without it (optional).
//
// No-op + return false without config (Property 10) and NEVER throws — a Slack
// delivery failure must not fail the report job that called it.

const logger = createLogger({
  service: 'admin:reports:slack',
  environment: process.env.NODE_ENV ?? 'development',
})

export async function postToSlack(text: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  // Not configured → no-op (Property 10).
  if (!webhookUrl) {
    logger.info('postToSlack skipped (SLACK_WEBHOOK_URL not configured)')
    return false
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      logger.warn('postToSlack non-ok response', { status: response.status })
      return false
    }
    return true
  } catch (error) {
    // Never throw — Slack delivery is best-effort.
    logger.error('postToSlack failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
