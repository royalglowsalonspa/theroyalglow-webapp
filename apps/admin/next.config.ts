import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@rgss/business',
    '@rgss/db',
    '@rgss/errors',
    '@rgss/logger',
    '@rgss/types',
    '@rgss/ui',
  ],
  // Static security headers applied to all routes (Req 7.7). The per-request,
  // nonce-based Content-Security-Policy is owned by the edge middleware
  // (`src/middleware.ts`) so it is intentionally NOT set here — a static
  // `script-src` would otherwise conflict with the middleware nonce policy.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Clickjacking protection (Req 7.7).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Disallow MIME-type sniffing.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Minimise referrer leakage to other origins.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The admin portal is private — never index it (complements the
          // root layout's robots `noindex` metadata set in task 6.1).
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

// Source-map upload is a no-op without SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN (CI-only).
export default withSentryConfig(nextConfig, { silent: true })
