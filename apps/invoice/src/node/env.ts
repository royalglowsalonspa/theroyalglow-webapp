/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/env
 * Scope        : Configuration
 *
 * Description  : Zod-validated process environment for the invoicing service.
 *                Fails fast at startup if a required secret/credential is
 *                missing — the service refuses to serve without the HMAC secret
 *                and the R2 credentials it needs to verify requests and store
 *                rendered PDFs.
 *
 * Notes        :
 * - PORT is injected by Cloud Run; the server MUST bind to it (default 8080).
 * - SENTRY_DSN is optional — observability is guarded/graceful when unset.
 ************************************************************/
import { z } from 'zod'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Cloud Run injects PORT; bind to it. 8080 is the Cloud Run default.
    PORT: z.coerce.number().int().positive().default(8080),

    // Shared HMAC secret — required to verify every signed request.
    INVOICE_PDF_HMAC_SECRET: z.string().min(1),

    // Cloudflare R2 (S3-compatible) — required to store/serve rendered PDFs.
    R2_BUCKET_NAME: z.string().min(1),
    R2_ENDPOINT: z.string().url(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_INVOICE_ACCESS: z.enum(['public', 'private']).default('public'),
    // Public base URL for deployments that still serve legacy direct links.
    R2_PUBLIC_BASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),

    // Optional error reporting.
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.R2_BUCKET_NAME === 'rgss-invoices' && value.R2_INVOICE_ACCESS !== 'private') {
      ctx.addIssue({
        code: 'custom',
        path: ['R2_INVOICE_ACCESS'],
        message: 'Set to private for the dedicated rgss-invoices bucket',
      })
    }
    if (value.R2_INVOICE_ACCESS === 'public' && !value.R2_PUBLIC_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['R2_PUBLIC_BASE_URL'],
        message: 'Required when R2_INVOICE_ACCESS is public',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  // Normalise the public base URL so key joins never produce a double slash.
  const data = parsed.data
  return {
    ...data,
    R2_PUBLIC_BASE_URL: data.R2_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
  }
}

export const env = loadEnv()
