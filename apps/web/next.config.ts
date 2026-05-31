import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@rgss/business', '@rgss/db', '@rgss/errors', '@rgss/logger', '@rgss/types'],
}

// Source-map upload is a no-op without SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN (CI-only).
export default withSentryConfig(nextConfig, { silent: true })
