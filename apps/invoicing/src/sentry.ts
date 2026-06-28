/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/sentry
 * Scope        : Observability (optional/guarded)
 *
 * Description  : Optional Sentry wiring. No-ops entirely when SENTRY_DSN is
 *                unset so the service runs identically with or without it.
 ************************************************************/
import * as Sentry from '@sentry/node'
import { env } from './env'

let initialized = false

// Initialise Sentry only when a DSN is configured. Safe to call once at boot.
export function initSentry(): void {
  if (!env.SENTRY_DSN || initialized) {
    return
  }
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV })
  initialized = true
}

// Report an unexpected error. No-op when Sentry is not initialised.
export function captureException(error: unknown): void {
  if (initialized) {
    Sentry.captureException(error)
  }
}
