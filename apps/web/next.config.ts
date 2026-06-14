import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@rgss/business', '@rgss/db', '@rgss/errors', '@rgss/logger', '@rgss/types'],
  images: {
    // Hosts that next/image is allowed to load from. CMS media resolves via
    // NEXT_PUBLIC_R2_PUBLIC_URL (R2 CDN) in prod, or the CMS origin in dev.
    remotePatterns: [
      // Cloudflare R2 public media host (matches NEXT_PUBLIC_R2_PUBLIC_URL)
      { protocol: 'https', hostname: 'uploads.theroyalglow.in' },
      // Payload CMS origin (prod) — fallback when media served from CMS
      { protocol: 'https', hostname: 'admin.theroyalglow.in' },
      // Payload CMS origin (local dev)
      { protocol: 'http', hostname: 'localhost', port: '3001' },
      // Mock/blog fallback imagery
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
}

// Source-map upload is a no-op without SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN (CI-only).
export default withSentryConfig(nextConfig, { silent: true })
