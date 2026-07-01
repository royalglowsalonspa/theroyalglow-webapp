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
  // Tree-shake barrel imports from large UI/client packages so their unused
  // exports never enter the bundle. Trims the OpenNext Cloudflare Worker
  // (customer site must fit the 3 MiB gzipped free-plan script limit).
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'motion',
      'posthog-js',
      'radix-ui',
      '@radix-ui/react-dropdown-menu',
      'sonner',
    ],
  },
  images: {
    // Hosts that next/image is allowed to load from. CMS media resolves via
    // NEXT_PUBLIC_R2_PUBLIC_URL (R2 CDN) in prod, or the CMS origin in dev.
    remotePatterns: [
      // Cloudflare R2 public media host (matches NEXT_PUBLIC_R2_PUBLIC_URL)
      { protocol: 'https', hostname: 'pub-40c9806a7ea146c9b0469960f8b84d94.r2.dev' },
      // Payload CMS origin (prod) — fallback when media served from CMS
      { protocol: 'https', hostname: 'cms.theroyalglow.in' },
      // Payload CMS origin (local dev)
      { protocol: 'http', hostname: 'localhost', port: '3002' },
      // Mock/blog fallback imagery
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // Static security headers applied to all routes. The per-request, nonce-based
  // Content-Security-Policy is owned by the edge middleware (`src/middleware.ts`)
  // so it is intentionally NOT set here — a static `script-src` would otherwise
  // conflict with the middleware nonce policy.
  //
  // NOTE: unlike the admin portal, the public customer site MUST stay indexable,
  // so NO `X-Robots-Tag: noindex` is emitted here.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Clickjacking protection (complements CSP `frame-ancestors 'none'`).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Disallow MIME-type sniffing.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Minimise referrer leakage to other origins.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

// Source-map upload is a no-op without SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN (CI-only).
// `bundleSizeOptimizations` + `disableLogger` strip Sentry debug/logger code and
// tree-shakeable internals from the build, shrinking the Worker bundle toward the
// 3 MiB gzipped free-plan limit while keeping error monitoring intact.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
})
