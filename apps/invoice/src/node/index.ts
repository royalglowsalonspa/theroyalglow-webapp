/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/index
 * Scope        : Bootstrap (Cloud Run entrypoint)
 *
 * Description  : Process entrypoint. Initialises optional Sentry, then starts
 *                the Hono app on the Cloud-Run-injected PORT (binds to it).
 ************************************************************/
import { serve } from '@hono/node-server'
import { createLogger } from '@rgss/logger'
import { app } from './app'
import { env } from './env'
import { initSentry } from './sentry'

const logger = createLogger({ service: 'invoicing', environment: env.NODE_ENV })

initSentry()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`listening on :${info.port}`)
})
