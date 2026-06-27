/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : open-next.config
 * Scope        : Cloudflare Workers deployment (OpenNext adapter)
 *
 * Description  : OpenNext configuration for deploying the customer site to
 *                Cloudflare Workers via `@opennextjs/cloudflare`. Consumed by
 *                `opennextjs-cloudflare build` (see the `cf:build` / `preview`
 *                / `deploy` scripts in package.json) to produce the Worker
 *                bundle at `.open-next/worker.js`.
 *
 * Why OpenNext (not next-on-pages / Pages):
 * - Runs Next.js on the Workers runtime with the Node.js compat layer, so the
 *   App Router, route handlers, middleware, ISR, and Server Actions this site
 *   relies on all work — unlike the feature-limited, now-stagnant Pages adapter.
 *
 * Caching:
 * - `defineCloudflareConfig()` with no overrides uses OpenNext's default
 *   (in-memory/per-instance) incremental cache. ISR pages (e.g. /blog at 1h,
 *   CMS-backed sections) still revalidate correctly, but the cache is NOT
 *   shared across Worker instances or deploys.
 * - PRODUCTION RECOMMENDATION: back the incremental cache with R2 so ISR
 *   survives across instances. Add the `NEXT_INC_CACHE_R2_BUCKET` binding in
 *   wrangler.jsonc and switch to `r2IncrementalCache` here:
 *
 *     import { defineCloudflareConfig } from '@opennextjs/cloudflare'
 *     import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
 *     export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache })
 *
 *   (Left at the default for the initial cutover to keep the first migration
 *   minimal and verifiable; enable R2 cache as a follow-up once the bucket
 *   exists.)
 *
 * Tech Stack   : Next.js 16, @opennextjs/cloudflare, Cloudflare Workers
 * Layer        : Infrastructure (build/deploy config)
 ************************************************************/

import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig()
