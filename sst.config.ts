/// <reference path="./.sst/platform/config.d.ts" />
/************************************************************
 * Project      : theroyalglow-webapp
 * Module Name  : sst.config
 * Scope        : Infrastructure (deployment)
 *
 * Description  : SST v3 deployment for apps/web and apps/admin on AWS Lambda +
 *                CloudFront, via sst.aws.Nextjs (which wraps OpenNext).
 *
 *                ONLY these two apps run on AWS. apps/cms stays on Render,
 *                apps/invoicing stays on Cloud Run, and Neon, Upstash, QStash,
 *                Resend, Ably and R2 are all unchanged — so this migration
 *                needs ZERO application code changes. See M2AWS.md.
 *
 * Region       : ap-southeast-1 (Singapore) — DECIDED 31/07/2026, co-located
 *                with Neon (which has no Mumbai region) and with the Render CMS.
 *                SSR makes several sequential queries per request and the Neon
 *                HTTP driver pays a round trip each time, so compute sits beside
 *                the database. CloudFront still serves assets from Indian edges.
 *
 *                REVIEW DUE early September 2026 — one month of real traffic,
 *                then decide whether to stay. Metrics, thresholds and the
 *                escalation order are in M2AWS.md §3.1. Do NOT change this
 *                region before collapsing sequential queries and adding caching;
 *                region is the expensive lever and rarely the right first one.
 *
 * Tech Stack   : SST v3, OpenNext, AWS Lambda (ARM64), CloudFront, S3
 * Layer        : Infrastructure
 *
 * Notes        : Per app SST creates an S3 assets bucket, a CloudFront
 *                distribution, an ARM64 SSR Lambda, a CloudFront routing
 *                function, a DynamoDB ISR tag cache and an SQS revalidation
 *                queue. All within always-free allowances at this traffic.
 *
 *                DOMAINS ARE COMMENTED OUT ON PURPOSE. Deploy without them
 *                first, verify on the generated CloudFront URLs, then attach
 *                the real hostnames at cutover (M2AWS.md §9).
 ************************************************************/

export default $config({
  app(input) {
    return {
      name: 'rgss',
      home: 'aws',
      // Retain infrastructure on a `production` removal; dev stages are disposable.
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      providers: {
        aws: { region: 'ap-southeast-1' },
      },
    }
  },

  async run() {
    const isProd = $app.stage === 'production'

    // ── Secrets ────────────────────────────────────────────────────────────
    // Set with: bunx sst secret set <Name> "<value>" --stage production
    // Stored as SSM SecureString; injected into the Lambda environment at deploy.
    // NEVER put NEXT_PUBLIC_* here — those are build-time and must be real
    // environment variables during `next build` (supplied by CI).
    const databaseUrl = new sst.Secret('DatabaseUrl')

    // ONE secret shared by both apps: sessions are exchanged across subdomains
    // via a `.theroyalglow.in`-scoped cookie, so the value must be byte-identical.
    const betterAuthSecret = new sst.Secret('BetterAuthSecret')

    const googleClientId = new sst.Secret('GoogleOauthClientId')
    const googleClientSecret = new sst.Secret('GoogleOauthClientSecret')
    const ablyPrivateKey = new sst.Secret('AblyPrivateKey')
    const upstashRedisUrl = new sst.Secret('UpstashRedisRestUrl')
    const upstashRedisToken = new sst.Secret('UpstashRedisRestToken')
    const qstashToken = new sst.Secret('QstashToken')
    const qstashCurrentKey = new sst.Secret('QstashCurrentSigningKey')
    const qstashNextKey = new sst.Secret('QstashNextSigningKey')
    const resendApiKey = new sst.Secret('ResendApiKey')
    const vapidPrivateKey = new sst.Secret('VapidPrivateKey')
    const invoicePdfHmacSecret = new sst.Secret('InvoicePdfHmacSecret')
    const internalJobToken = new sst.Secret('InternalJobToken')
    const r2AccessKeyId = new sst.Secret('R2AccessKeyId')
    const r2SecretAccessKey = new sst.Secret('R2SecretAccessKey')

    // Forward only variables that actually carry a value.
    //
    // WHY: t3-env does NOT coerce '' to undefined, so `?? ''` on an unset CI
    // variable turns an OPTIONAL var into an invalid one — `z.string().url()`
    // rejects '' and every Lambda cold start throws, 500-ing every request.
    // The build cannot catch it: during `next build` the var is genuinely
    // absent, so validation passes and the fault appears only at runtime.
    const passthrough = (vars: Record<string, string | undefined>) =>
      Object.fromEntries(
        Object.entries(vars).filter(([, value]) => value !== undefined && value !== ''),
      ) as Record<string, string>

    // Environment shared by both apps. Values that differ per app are set below.
    const sharedEnv = {
      APP_ENV: isProd ? 'prod' : $app.stage,
      DATABASE_URL: databaseUrl.value,
      BETTER_AUTH_SECRET: betterAuthSecret.value,
      GOOGLE_OAUTH_CLIENT_ID: googleClientId.value,
      GOOGLE_OAUTH_CLIENT_SECRET: googleClientSecret.value,
      ABLY_PRIVATE_KEY: ablyPrivateKey.value,
      UPSTASH_REDIS_REST_URL: upstashRedisUrl.value,
      UPSTASH_REDIS_REST_TOKEN: upstashRedisToken.value,
      QSTASH_TOKEN: qstashToken.value,
      QSTASH_CURRENT_SIGNING_KEY: qstashCurrentKey.value,
      QSTASH_NEXT_SIGNING_KEY: qstashNextKey.value,
      INTERNAL_JOB_TOKEN: internalJobToken.value,
      // Storage stays on Cloudflare R2 (S3-compatible, zero egress).
      R2_ACCESS_KEY_ID: r2AccessKeyId.value,
      R2_SECRET_ACCESS_KEY: r2SecretAccessKey.value,
      INVOICE_PDF_HMAC_SECRET: invoicePdfHmacSecret.value,
      // Non-secret runtime config, supplied by CI as repo variables.
      // Omitted when unset — see the note on `passthrough` above.
      // INVOICING_SERVICE_URL is currently unset (same as Render), so invoice
      // email degrades to a no-attachment send rather than crashing the app.
      ...passthrough({
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
        R2_ENDPOINT: process.env.R2_ENDPOINT,
        INVOICING_SERVICE_URL: process.env.INVOICING_SERVICE_URL,
      }),
    }

    // ── Customer site — theroyalglow.in ───────────────────────────────────
    const web = new sst.aws.Nextjs('Web', {
      path: 'apps/web',
      // Attach at cutover only (M2AWS.md §9), after verifying on the CF URL:
      // domain: {
      //   name: 'theroyalglow.in',
      //   redirects: ['www.theroyalglow.in'],
      // },
      environment: {
        ...sharedEnv,
        // NEXT_PUBLIC_APP_URL differs per app and cannot be a single repo
        // variable — it must be set here so each build gets the right value.
        NEXT_PUBLIC_APP_URL: 'https://theroyalglow.in',
        BETTER_AUTH_URL: 'https://theroyalglow.in',
        RESEND_API_KEY: resendApiKey.value,
        VAPID_PRIVATE_KEY: vapidPrivateKey.value,
        VAPID_SUBJECT: 'mailto:contact@theroyalglow.in',
      },
      server: {
        architecture: 'arm64',
        memory: '1024 MB',
        timeout: '20 seconds',
      },
    })

    // ── Admin portal — admin.theroyalglow.in ──────────────────────────────
    // Also the background-job target: QStash POSTs to /api/jobs/* here.
    const admin = new sst.aws.Nextjs('Admin', {
      path: 'apps/admin',
      // domain: { name: 'admin.theroyalglow.in' },
      environment: {
        ...sharedEnv,
        // NEXT_PUBLIC_APP_URL for the admin app is its own subdomain, not the
        // customer site — must be set here so the build gets the right value.
        NEXT_PUBLIC_APP_URL: 'https://admin.theroyalglow.in',
        BETTER_AUTH_URL: 'https://admin.theroyalglow.in',
        // apps/admin/src/env.ts requires both; on Neon these are the pooled and
        // direct hosts respectively.
        DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED ?? databaseUrl.value,
        // Email + web push belong here too, NOT only on web. This app owns the
        // whole /api/jobs/* surface (reminders, birthday mail, membership
        // alerts, daily/weekly reports) and lib/notifications/dispatch.ts.
        // Both providers read process.env directly and NO-OP SILENTLY when the
        // key is absent: the job returns 200, pings its BetterStack heartbeat
        // and sends nothing. Without these two the whole notification layer
        // would look healthy while being mute.
        RESEND_API_KEY: resendApiKey.value,
        VAPID_PRIVATE_KEY: vapidPrivateKey.value,
        VAPID_SUBJECT: 'mailto:contact@theroyalglow.in',
      },
      server: {
        architecture: 'arm64',
        memory: '1024 MB',
        timeout: '30 seconds', // reports and invoice orchestration run longer
      },
    })

    return {
      web: web.url,
      admin: admin.url,
    }
  },
})
