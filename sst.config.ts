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
 *                apps/invoice stays on Cloud Run, and Neon, Upstash, QStash,
 *                Resend, Ably and R2 are all unchanged — so this migration
 *                needs ZERO application code changes. See M2C/M2AWS.md.
 *
 * Region       : ap-southeast-1 (Singapore) — DECIDED 31/07/2026, co-located
 *                with Neon (which has no Mumbai region) and with the Render CMS.
 *                SSR makes several sequential queries per request and the Neon
 *                HTTP driver pays a round trip each time, so compute sits beside
 *                the database. CloudFront still serves assets from Indian edges.
 *
 *                REVIEW DUE early September 2026 — one month of real traffic,
 *                then decide whether to stay. Metrics, thresholds and the
 *                escalation order are in M2C/M2AWS.md §3.1. Do NOT change this
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
 *                Production names attach only on the `production` stage.
 *                Rehearsal stages use an independently managed domain and
 *                certificate. Production DNS stays on Cloudflare.
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
        ...(!input.stage?.startsWith('rehearsal-') && {
          cloudflare: { package: '@pulumi/cloudflare', version: '6.20.0' },
        }),
      },
    }
  },

  async run() {
    const { readRehearsalConfig, rehearsalAblyKey, rehearsalDatabaseUrl, rehearsalQStashOrigin } =
      await import('./scripts/release/rehearsal-config')
    const isProd = $app.stage === 'production'
    const rehearsal = readRehearsalConfig($app.stage, process.env)
    const qstashUrl = process.env.QSTASH_URL?.trim()
    const invoiceRosterUrl = rehearsal
      ? rehearsal.invoiceRosterOrigin && `${rehearsal.invoiceRosterOrigin}/internal/v1/staff-roster`
      : process.env.INVOICE_ROSTER_URL?.trim()
    const invoiceRosterSource = rehearsal ? 'staging' : process.env.INVOICE_ROSTER_SOURCE?.trim()
    const invoiceEventsUrl = rehearsal?.invoiceEventsOrigin
      ? `${rehearsal.invoiceEventsOrigin}/internal/v1/invoice-events`
      : isProd
        ? process.env.INVOICE_EVENTS_URL?.trim()
        : undefined
    const invoiceEventsSource = rehearsal ? 'staging' : process.env.INVOICE_EVENTS_SOURCE?.trim()
    if (isProd) {
      if (
        (invoiceRosterUrl || invoiceRosterSource) &&
        (invoiceRosterUrl !== 'https://invoice.theroyalglow.in/internal/v1/staff-roster' ||
          invoiceRosterSource !== 'production')
      ) {
        throw new Error(
          'Set INVOICE_ROSTER_URL and INVOICE_ROSTER_SOURCE to the production invoice roster endpoint and source, or leave both unset.',
        )
      }
      if (
        (invoiceEventsUrl || invoiceEventsSource) &&
        (invoiceEventsUrl !== 'https://invoice.theroyalglow.in/internal/v1/invoice-events' ||
          invoiceEventsSource !== 'production')
      ) {
        throw new Error(
          'Set INVOICE_EVENTS_URL and INVOICE_EVENTS_SOURCE to the production invoice event endpoint and source, or leave both unset.',
        )
      }
    }
    const deliveryPrefix = rehearsal ? 'REHEARSAL_' : isProd ? '' : undefined
    const deliveryBranch =
      deliveryPrefix === undefined
        ? undefined
        : process.env[`${deliveryPrefix}INVOICE_AUTOMATIC_EMAIL_BRANCH_ID`]?.trim()
    const deliveryStart =
      deliveryPrefix === undefined
        ? undefined
        : process.env[`${deliveryPrefix}INVOICE_AUTOMATIC_EMAIL_START_AT`]?.trim()
    if (
      (deliveryBranch || deliveryStart) &&
      !(deliveryBranch && deliveryStart && invoiceEventsUrl && invoiceEventsSource)
    ) {
      throw new Error(
        'Set both invoice automatic email cutover settings and the invoice publisher for this stage',
      )
    }

    // ── DNS ────────────────────────────────────────────────────────────────
    // theroyalglow.in is hosted on Cloudflare (blakely/jarred.ns.cloudflare.com)
    // and STAYS there — cms.theroyalglow.in still points at Render and R2 serves
    // media from the same zone, so moving the zone to Route 53 would mean
    // recreating every unrelated record for no benefit. SST manages only the
    // records it needs: the ACM validation CNAMEs, the CAA records, and the
    // aliases below.
    //
    // Zone ID is not a secret; it is an account-scoped identifier, like the AWS
    // account number in M2C/M2AWS.md. Passing it explicitly avoids the account-wide
    // zone lookup, so the API token only needs this one zone.
    //
    // Requires CLOUDFLARE_API_TOKEN at deploy time with Zone:Read + DNS:Edit.
    const cloudflareZone = '9c72d0f642d34af388e7d870073dc64d'
    const dns = isProd ? sst.cloudflare.dns({ zone: cloudflareZone }) : undefined

    // ── Secrets ────────────────────────────────────────────────────────────
    // Set with: bunx sst secret set <Name> "<value>" --stage production
    // SST stores these per stage and injects the values at deploy.
    // NEVER put NEXT_PUBLIC_* here — those are build-time and must be real
    // environment variables during `next build` (supplied by CI).
    const stageSecret = (name: string, placeholder?: string) =>
      new sst.Secret(rehearsal ? `Rehearsal${name}` : name, placeholder)
    const databaseUrl = stageSecret('DatabaseUrl')
    const pooledDatabaseUrl = rehearsal
      ? databaseUrl.value.apply((value) => rehearsalDatabaseUrl(value, rehearsal.neonHost, false))
      : databaseUrl.value

    // Both apps share one signing secret for the stage's cookie domain.
    const betterAuthSecret = stageSecret('BetterAuthSecret')

    const googleClientId = stageSecret('GoogleOauthClientId')
    const googleClientSecret = stageSecret('GoogleOauthClientSecret')
    const ablyPrivateKey = stageSecret('AblyPrivateKey')
    const upstashRedisUrl = stageSecret('UpstashRedisRestUrl')
    const upstashRedisToken = stageSecret('UpstashRedisRestToken')
    const qstashToken = stageSecret('QstashToken')
    const qstashCurrentKey = stageSecret('QstashCurrentSigningKey')
    const qstashNextKey = stageSecret('QstashNextSigningKey')
    // Heartbeat URLs are credentials. An unset monitor is a no-op in admin.
    const heartbeatMissingManager = stageSecret('BetterStackHeartbeatMissingManager', '')
    const heartbeatServiceDrift = stageSecret('BetterStackHeartbeatServiceDrift', '')
    const heartbeatSettlementClose = stageSecret('BetterStackHeartbeatSettlementClose', '')
    const heartbeatStaffOverrun = stageSecret('BetterStackHeartbeatStaffOverrun', '')
    const resendApiKey = stageSecret('ResendApiKey')
    const vapidPrivateKey = stageSecret('VapidPrivateKey')
    const invoicePdfHmacSecret = stageSecret('InvoicePdfHmacSecret')
    // Shared with the Render-hosted CMS, which POSTs it to web /api/revalidate
    // after a content save. Web-only: apps/admin has no revalidate route. Without
    // it that handler answers 503 "Revalidation not configured", the CMS hook
    // swallows the failure, and owner edits stay invisible until the 1h fetch TTL
    // lapses — which is exactly how a published hero banner kept rendering the
    // bundled fallback SVG. The value MUST be byte-identical to the CMS setting.
    const revalidateSecret = stageSecret('RevalidateSecret')
    const internalJobToken = stageSecret('InternalJobToken')
    const r2AccessKeyId = stageSecret('R2AccessKeyId')
    const r2SecretAccessKey = stageSecret('R2SecretAccessKey')

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
      DATABASE_URL: pooledDatabaseUrl,
      BETTER_AUTH_SECRET: betterAuthSecret.value,
      GOOGLE_OAUTH_CLIENT_ID: googleClientId.value,
      GOOGLE_OAUTH_CLIENT_SECRET: googleClientSecret.value,
      ABLY_PRIVATE_KEY: rehearsal
        ? ablyPrivateKey.value.apply((value) => rehearsalAblyKey(value, rehearsal.ablyAppId))
        : ablyPrivateKey.value,
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
      ...(rehearsal
        ? {
            COOKIE_DOMAIN: rehearsal.cookieDomain,
            NEXT_PUBLIC_WEB_ORIGIN: rehearsal.web.origin,
            NEXT_PUBLIC_ADMIN_URL: rehearsal.admin.origin,
            NEXT_PUBLIC_CMS_URL: rehearsal.cmsOrigin,
            NEXT_PUBLIC_R2_PUBLIC_URL: rehearsal.r2PublicOrigin,
            NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleClientId.value,
            NEXT_PUBLIC_ABLY_KEY: rehearsal.ablyAppId,
            NEXT_PUBLIC_VAPID_PUBLIC_KEY: rehearsal.vapidPublicKey,
            NEXT_PUBLIC_POSTHOG_KEY: rehearsal.posthogKey,
            NEXT_PUBLIC_POSTHOG_HOST: rehearsal.posthogHost,
            NEXT_PUBLIC_SENTRY_DSN: '',
            NEXT_PUBLIC_ADMIN_SENTRY_DSN: '',
            NEXT_PUBLIC_META_PIXEL_ID: '',
            NEXT_PUBLIC_CLARITY_ID: '',
            QSTASH_URL: rehearsal.qstashOrigin,
            R2_BUCKET_NAME: rehearsal.r2Bucket,
            R2_ENDPOINT: rehearsal.r2Endpoint,
            INVOICING_SERVICE_URL: rehearsal.invoicingOrigin,
            CONTACT_INBOX_EMAIL: rehearsal.contactEmail,
            RESEND_FROM_EMAIL: rehearsal.contactEmail,
          }
        : passthrough({
            QSTASH_URL: qstashUrl ? rehearsalQStashOrigin(qstashUrl) : undefined,
            R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
            R2_ENDPOINT: process.env.R2_ENDPOINT,
            INVOICING_SERVICE_URL: process.env.INVOICING_SERVICE_URL,
          })),
    }

    // ── Customer site — theroyalglow.in ───────────────────────────────────
    const web = new sst.aws.Nextjs('Web', {
      path: 'apps/web',
      ...(dns && {
        domain: {
          name: 'theroyalglow.in',
          // Serves an apex-redirect on the same distribution, so www needs no
          // separate origin. It DOES need its old Render CNAME removed first.
          redirects: ['www.theroyalglow.in'],
          dns,
        },
      }),
      ...(rehearsal && {
        domain: { name: rehearsal.web.hostname, cert: rehearsal.web.cert, dns: false as const },
      }),
      environment: {
        ...sharedEnv,
        // NEXT_PUBLIC_APP_URL differs per app and cannot be a single repo
        // variable — it must be set here so each build gets the right value.
        NEXT_PUBLIC_APP_URL: rehearsal?.web.origin ?? 'https://theroyalglow.in',
        BETTER_AUTH_URL: rehearsal?.web.origin ?? 'https://theroyalglow.in',
        // Authenticates the CMS -> web revalidation ping. Web only.
        REVALIDATE_SECRET: revalidateSecret.value,
        RESEND_API_KEY: resendApiKey.value,
        VAPID_PRIVATE_KEY: vapidPrivateKey.value,
        VAPID_SUBJECT: rehearsal
          ? `mailto:${rehearsal.contactEmail}`
          : 'mailto:contact@theroyalglow.in',
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
      // Separate distribution, separate certificate — but sessions still work
      // across both because the auth cookie is scoped to `.theroyalglow.in`,
      // and cookie scope follows the domain, not the origin.
      ...(dns && {
        domain: {
          name: 'admin.theroyalglow.in',
          dns,
        },
      }),
      ...(rehearsal && {
        domain: { name: rehearsal.admin.hostname, cert: rehearsal.admin.cert, dns: false as const },
      }),
      environment: {
        ...sharedEnv,
        // NEXT_PUBLIC_APP_URL for the admin app is its own subdomain, not the
        // customer site — must be set here so the build gets the right value.
        NEXT_PUBLIC_APP_URL: rehearsal?.admin.origin ?? 'https://admin.theroyalglow.in',
        BETTER_AUTH_URL: rehearsal?.admin.origin ?? 'https://admin.theroyalglow.in',
        ...(invoiceRosterUrl &&
          invoiceRosterSource && {
            INVOICE_ROSTER_URL: invoiceRosterUrl,
            INVOICE_ROSTER_SOURCE: invoiceRosterSource,
            INVOICE_ROSTER_SECRET: stageSecret('InvoiceRosterSecret').value,
            INVOICE_ROSTER_ACCESS_CLIENT_ID: stageSecret('InvoiceRosterAccessClientId').value,
            INVOICE_ROSTER_ACCESS_CLIENT_SECRET: stageSecret('InvoiceRosterAccessClientSecret')
              .value,
          }),
        ...(invoiceEventsUrl &&
          invoiceEventsSource && {
            INVOICE_EVENTS_URL: invoiceEventsUrl,
            INVOICE_EVENTS_SOURCE: invoiceEventsSource,
            INVOICE_EVENTS_SECRET: stageSecret('InvoiceEventsSecret').value,
            INVOICE_EVENTS_ACCESS_CLIENT_ID: stageSecret('InvoiceEventsAccessClientId').value,
            INVOICE_EVENTS_ACCESS_CLIENT_SECRET: stageSecret('InvoiceEventsAccessClientSecret')
              .value,
          }),
        ...(deliveryBranch &&
          deliveryStart && {
            INVOICE_AUTOMATIC_EMAIL_BRANCH_ID: deliveryBranch,
            INVOICE_AUTOMATIC_EMAIL_START_AT: deliveryStart,
          }),
        // apps/admin/src/env.ts requires both; on Neon these are the pooled and
        // direct hosts respectively.
        DATABASE_URL_UNPOOLED: rehearsal
          ? databaseUrl.value.apply((value) =>
              rehearsalDatabaseUrl(value, rehearsal.neonHost, true),
            )
          : (process.env.DATABASE_URL_UNPOOLED ?? databaseUrl.value),
        // Email + web push belong here too, NOT only on web. This app owns the
        // whole /api/jobs/* surface (reminders, birthday mail, membership
        // alerts, daily/weekly reports) and lib/notifications/dispatch.ts.
        // Both providers read process.env directly and NO-OP SILENTLY when the
        // key is absent: the job returns 200, pings its BetterStack heartbeat
        // and sends nothing. Without these two the whole notification layer
        // would look healthy while being mute.
        RESEND_API_KEY: resendApiKey.value,
        VAPID_PRIVATE_KEY: vapidPrivateKey.value,
        VAPID_SUBJECT: rehearsal
          ? `mailto:${rehearsal.contactEmail}`
          : 'mailto:contact@theroyalglow.in',
        BETTER_STACK_HEARTBEAT_MISSING_MANAGER: heartbeatMissingManager.value,
        BETTER_STACK_HEARTBEAT_SERVICE_DRIFT: heartbeatServiceDrift.value,
        BETTER_STACK_HEARTBEAT_SETTLEMENT_CLOSE: heartbeatSettlementClose.value,
        BETTER_STACK_HEARTBEAT_STAFF_OVERRUN: heartbeatStaffOverrun.value,
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
