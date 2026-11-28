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

// Sentry v11 collects every supported data category by default. Preserve the
// restrictive v10 baseline so invoice payloads and customer identity do not
// enter observability events.
const PII_DENY_PATTERNS = ['forwarded', '-ip', 'remote-', 'via', '-user']

const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: PII_DENY_PATTERNS },
    response: { deny: PII_DENY_PATTERNS },
  },
  httpBodies: [],
  urlQueryParams: { deny: PII_DENY_PATTERNS },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
}

let initialized = false

// Initialise Sentry only when a DSN is configured. Safe to call once at boot.
export function initSentry(): void {
  if (!env.SENTRY_DSN || initialized) {
    return
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    dataCollection: DATA_COLLECTION,
  })
  initialized = true
}

// Report an unexpected error. No-op when Sentry is not initialised.
export function captureException(error: unknown): void {
  if (initialized) {
    Sentry.captureException(error)
  }
}
