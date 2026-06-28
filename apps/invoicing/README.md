# @rgss/invoicing

Standalone Node.js service that renders **GST invoice PDFs** for The Royal Glow
and stores them in Cloudflare R2. Deployed to **Google Cloud Run**.

It renders a **templated vector PDF** with [`@react-pdf/renderer`](https://react-pdf.org)
— no Chromium, no Puppeteer, no screenshots — so the container stays small and
cold-starts fast.

## Contract & invariants

- The request body is the fully-computed render contract `invoicePdfPayloadSchema`
  from `@rgss/types`. Every monetary value is final integer **paise** computed
  upstream by `@rgss/business`.
- **The service never recomputes** tax / discount / total — it only renders the
  supplied values.
- All money is formatted via `@rgss/business` `formatINR`, dates via
  `formatDateIN` (IST), amount-in-words via `amountInWordsINR`.
- **HMAC-SHA256 is enforced in-app** on every `POST /v1/invoices` request before
  any work is done.

## Endpoints

| Method | Path           | Description                                         |
| ------ | -------------- | --------------------------------------------------- |
| GET    | `/healthz`     | Liveness probe → `200 { "status": "ok" }`           |
| POST   | `/v1/invoices` | HMAC-verified render + store (idempotent)           |

### `POST /v1/invoices`

Required headers:

- `x-rgss-timestamp` — unix-ms timestamp that was signed
- `x-rgss-signature` — hex HMAC-SHA256 of `` `${timestamp}.${rawBody}` `` using
  `INVOICE_PDF_HMAC_SECRET`

Flow: verify signature → `400` if body invalid → compute object key → if it
already exists in R2, return the stored bytes (`reused: true`); otherwise render,
upload, and return the fresh bytes (`reused: false`). The response conforms to
`invoicePdfResultSchema`:

```json
{ "invoiceNumber": "INV-1-2627-92921", "pdfUrl": "https://…/invoices/2026/INV-1-2627-92921.pdf", "pdfBase64": "…", "reused": false }
```

Invalid / missing signature → `401` with no work performed.

## R2 object-key scheme

```
invoices/{YYYY}/{invoiceNumber}.pdf
```

`YYYY` is the `issuedAt` year (UTC). The public URL is
`${R2_PUBLIC_BASE_URL}/${key}`.

## Environment variables

| Variable                  | Required | Default       | Notes                                            |
| ------------------------- | -------- | ------------- | ------------------------------------------------ |
| `PORT`                    | no       | `8080`        | **Cloud Run injects this — the app binds to it** |
| `NODE_ENV`                | no       | `development` | `development` \| `test` \| `production`          |
| `INVOICE_PDF_HMAC_SECRET` | **yes**  | —             | Shared secret for request verification           |
| `R2_BUCKET_NAME`          | **yes**  | —             | R2 bucket                                        |
| `R2_ENDPOINT`             | **yes**  | —             | R2 S3 endpoint URL                               |
| `R2_ACCESS_KEY_ID`        | **yes**  | —             | R2 access key                                    |
| `R2_SECRET_ACCESS_KEY`    | **yes**  | —             | R2 secret key                                    |
| `R2_PUBLIC_BASE_URL`      | **yes**  | —             | Base URL used to build `pdfUrl`                  |
| `SENTRY_DSN`              | no       | —             | Optional; error reporting is no-op when unset    |

The service fails fast at startup if a required variable is missing.

## Local run

```bash
# from the repo root
bun install

# typecheck + lint this workspace
bunx turbo run typecheck lint --filter=@rgss/invoicing

# build (tsup → dist/index.js) and start
bun run --filter=@rgss/invoicing build
bun run --filter=@rgss/invoicing start
```

With the env vars exported, `GET http://localhost:8080/healthz` returns
`{ "status": "ok" }`.

## Build approach (why bundling)

This is a Bun monorepo and the `@rgss/*` workspace packages export raw TS source.
`tsup` (see `tsup.config.ts`) bundles the service **and** the `@rgss/*` packages
into a single ESM file (`noExternal: /^@rgss\//`), while keeping the heavy npm
deps (`@react-pdf/renderer`, `@aws-sdk/client-s3`, `hono`, `@hono/node-server`,
`@sentry/node`, `react`) **external** — they are installed as prod
`node_modules` in the final image. See the comment block at the top of the
`Dockerfile` for the multi-stage layout.

## Cloud Run deploy

Build from this directory (the `Dockerfile` expects the **repo root** as build
context because it needs the workspace packages):

```bash
# from the repo root
gcloud run deploy rgss-invoicing \
  --source . \
  --region asia-south1 \
  --port 8080 \
  --min-instances 0 \
  --no-allow-unauthenticated
```

> If deploying with `--source`, point it at the repo root and set the
> Dockerfile path, or run `docker build -f apps/invoicing/Dockerfile .` from the
> repo root and deploy the resulting image.

- `--min-instances 0` → scale to zero (₹0 when idle).
- `--no-allow-unauthenticated` → HMAC is still enforced in-app; Cloud Run IAM is
  an additional outer layer.

### Automated deploy (CI)

`.github/workflows/deploy-invoicing.yml` builds the image (repo-root Docker
context), pushes it to Artifact Registry, and deploys to Cloud Run on every push
to `prod` that touches `apps/invoicing/**` or `packages/**` (and on manual
`workflow_dispatch`). It authenticates keylessly via Workload Identity
Federation and mounts the runtime secrets from Secret Manager. See that file's
header for the one-time GCP setup and the required GitHub secrets/vars.

### Secrets via Secret Manager

Store secrets in Secret Manager and mount them as env vars:

```bash
gcloud run services update rgss-invoicing --region asia-south1 \
  --set-secrets=INVOICE_PDF_HMAC_SECRET=invoice-pdf-hmac-secret:latest \
  --set-secrets=R2_ACCESS_KEY_ID=r2-access-key-id:latest \
  --set-secrets=R2_SECRET_ACCESS_KEY=r2-secret-access-key:latest \
  --set-env-vars=R2_BUCKET_NAME=...,R2_ENDPOINT=...,R2_PUBLIC_BASE_URL=...
```
