import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'

// This app intentionally has no root instrumentation.ts: OpenNext's trace-copy
// of it breaks the SST build. Server init runs through
// src/lib/api/sentry-server-init.ts instead, so the SDK's "Could not find a
// Next.js instrumentation file" warning is expected and would only be noise.
// Set here (not in a script) so it applies on every OS and every entry point.
process.env.SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING ??= '1'

const nextConfig: NextConfig = {
  // TypeScript 7 has no JavaScript Compiler API. Make Next run the
  // project-local native `tsc` CLI for build-time validation instead.
  experimental: {
    useTypeScriptCli: true,
  },
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
