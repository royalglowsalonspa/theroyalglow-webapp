/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : open-next.config
 * Scope        : Cloudflare Workers deployment (OpenNext adapter)
 *
 * Description  : OpenNext configuration for deploying the admin portal to
 *                Cloudflare Workers via `@opennextjs/cloudflare`. Consumed by
 *                `opennextjs-cloudflare build` to produce `.open-next/worker.js`.
 *
 * Why OpenNext (not next-on-pages / Pages):
 * - The admin portal depends on per-request nonce-based CSP injected by edge
 *   middleware and many Node-runtime route handlers. OpenNext's Node.js compat
 *   runs all of this on Workers unchanged; the legacy Pages adapter could not.
 *
 * Caching:
 * - Default (in-memory) incremental cache is fine here: the admin portal is
 *   almost entirely dynamic (RBAC-gated, live data), so there is little ISR to
 *   persist. R2-backed cache is therefore lower value than for apps/web, but
 *   the same `r2IncrementalCache` override pattern applies if ever needed
 *   (see apps/web/open-next.config.ts for the snippet).
 *
 * Tech Stack   : Next.js 16, @opennextjs/cloudflare, Cloudflare Workers
 * Layer        : Infrastructure (build/deploy config)
 ************************************************************/

import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig()
