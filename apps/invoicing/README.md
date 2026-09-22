# Invoicing service · `@rgss/invoicing`

A standalone Hono/Node.js service that renders invoice PDFs from a validated request and stores them in Cloudflare R2. It uses `@react-pdf/renderer` to produce an A4 vector document with built-in fonts; no browser or Chromium process is involved.

[Repository overview](../../README.md) · [Agent instructions](AGENTS.md) · [Shared invoice contract](../../packages/types/src/invoice-pdf.ts) · [Deployment guide](../../knowledge-base/deployment.md)

## Responsibility

This service owns **rendering and storage**. Invoice creation, final tax/discount calculations, payment recording, database updates, and email delivery belong to the calling application and shared packages.

The current caller is the admin [invoice PDF job](../admin/src/app/api/jobs/invoice-pdf/route.ts). It loads the invoice, constructs and signs the render request, stores the returned URL, and sends the invoice email. It can fall back to email without an attachment when the PDF service is unavailable or unconfigured; a successful job response therefore does not prove a PDF was rendered.

```text
Admin invoice job
  → raw-body HMAC-signed request
  → verify signature and timestamp
  → validate the shared invoice payload
  → reuse an existing R2 object, or render and upload a PDF
  → validate and return URL + PDF bytes
  → admin persists the URL and handles email
```

## Source map

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Starts the Node HTTP server on the configured port; initializes Sentry |
| `src/app.ts` | Hono routes, signature verification, validation, render/store orchestration |
| `src/env.ts` | Startup environment validation and public URL normalization |
| `src/render.ts` | Converts the React PDF document into bytes |
| `src/template/InvoiceDocument.tsx` | A4 layout, invoice fields, money/date presentation |
| `src/storage/r2.ts` | Object keys, URLs, existence checks, reads, and uploads |
| `src/sentry.ts` | Optional exception reporting |
| `tsup.config.ts` | Node 22 ESM bundle and runtime external dependencies |
| `Dockerfile` | Repository-context container packaging; review caveats below |

Shared dependencies are `@rgss/types` for contracts, `@rgss/business` for formatting and request signing, and the common logging/error packages. No database connection is configured here.

## HTTP contract

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/healthz` | `200 { "status": "ok" }`; process liveness only |
| `POST` | `/v1/invoices` | Verify, render/reuse, store, and return the invoice PDF result |

### Signed invoice request

Send JSON matching `invoicePdfPayloadSchema` with these headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `x-rgss-timestamp` | Unix timestamp in milliseconds |
| `x-rgss-signature` | Hex HMAC-SHA256 of `${timestamp}.${rawBody}` using `INVOICE_PDF_HMAC_SECRET` |

Use the shared [request-signing helpers](../../packages/business/src/security/request-signing.ts) on both sides. The verifier allows a five-minute timestamp tolerance in either direction. Serialize once, sign that exact text, then send it unchanged. The service verifies the signature before parsing or performing storage/rendering work.

All monetary values arrive as final integer **paise**. The service formats them for display; it does not recalculate GST, discounts, or totals. Seller/customer/line-item fields and optional data are defined by the shared schema, which is authoritative over examples.

Success is a direct `InvoicePdfResult` object:

```json
{
  "invoiceNumber": "INV-EXAMPLE",
  "pdfUrl": "https://media.example.test/invoices/2026/INV-EXAMPLE.pdf",
  "pdfBase64": "<base64-encoded-pdf>",
  "reused": false
}
```

The URL above is illustrative. The response is not wrapped in the web app's `success/data` envelope. Missing/invalid signatures return **401**, invalid JSON or schema data returns **400**, and unexpected render/storage failures return **500** without stack traces.

### Storage and reuse

Object keys are `invoices/{YYYY}/{invoiceNumber}.pdf`, where `YYYY` comes from the UTC year of `issuedAt`. Download URLs join that key to `R2_PUBLIC_BASE_URL`; the code does not generate expiring signed download URLs.

An existing key returns its stored bytes with `reused: true`; otherwise the service renders and uploads with `Content-Type: application/pdf`. This is a HEAD-then-GET/PUT reuse mechanism, not an atomic exactly-once guarantee across concurrent requests. Storage errors other than not-found propagate as failures.

The key does not include template version or request contents. Reusing the same invoice number and year returns the existing PDF even when the template or payload changes.

## Environment

[`src/env.ts`](src/env.ts) validates these variables at process startup. Required variables are needed even to start the health endpoint.

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `INVOICE_PDF_HMAC_SECRET` | Required | Shared request-verification secret; must match the admin caller |
| `R2_BUCKET_NAME` | Required | Destination bucket |
| `R2_ENDPOINT` | Required URL | S3-compatible R2 API endpoint |
| `R2_ACCESS_KEY_ID` | Required | R2 access credential |
| `R2_SECRET_ACCESS_KEY` | Required | R2 secret credential |
| `R2_PUBLIC_BASE_URL` | Required URL | Base used for the returned PDF URL; trailing slashes normalized |
| `PORT` | Optional; `8080` | Listening port; honor the value supplied by Cloud Run |
| `NODE_ENV` | Optional; `development` | `development`, `test`, or `production` |
| `SENTRY_DSN` | Optional URL | Error reporting; omit when unused |

There is no app-local env template in this folder. Refer to the [shared example](../../.env.example), but include only the required app settings in an ignored local file or process environment. Never use production credentials for exploratory rendering. There is no `SKIP_ENV_VALIDATION` bypass in this service.

## Local development

From the **repository root**, with the runtime variables available:

```bash
bun install --frozen-lockfile
bun run --filter=@rgss/invoicing dev
```

The dev command watches with tsup and restarts `node dist/index.js`. For a normal build and start:

```bash
bun run --filter=@rgss/invoicing build
bun run --filter=@rgss/invoicing start
```

The Node entrypoint does not load env files itself. To explicitly load an ignored `.env.local` with Node, run this from **`apps/invoicing`** after building:

```bash
node --env-file=.env.local dist/index.js
```

`GET http://localhost:8080/healthz` verifies the process is serving. It does not check R2 access, HMAC agreement with the caller, PDF contents, or email delivery.

## Verification

Run from the **repository root**:

```bash
bunx turbo run lint typecheck build --filter=@rgss/invoicing
bunx vitest run --project business packages/business/src/invoicing
```

The second command exercises existing shared invoice-domain tests, not the service's HTTP/storage integration. The workspace currently has no `test` script, and root Vitest has no invoicing project. Add test discovery alongside future service tests so they actually run in CI.

For a deliberate service smoke test, use a test bucket and a valid shared-schema fixture. Verify rejection of missing/stale/bad signatures, rejection of invalid payloads, fresh rendering, stored-object reuse, readable PDF content, and a clear failure for unavailable storage. Check that visual changes preserve long customer names, line-item wrapping, and totals. The task should explicitly account for the test objects it creates.

Date-display caveat: the template currently adds an IST offset before passing the date to `formatDateIN`, which already formats in `Asia/Kolkata`. This can double-adjust the displayed calendar date near a boundary. Review both implementations and add boundary cases when addressing that behavior; it is not a recommended formatting pattern.

## Packaging and deployment

The service targets Google Cloud Run. `tsup.config.ts` bundles `@rgss/*` source into `dist/index.js` and keeps the larger npm packages external. The final runtime must therefore include those external dependencies.

The Dockerfile expects the **repository root** as build context:

```bash
docker build -f apps/invoicing/Dockerfile -t rgss-invoicing:local .
```

Review packaging before a deployment: the Dockerfile currently uses an older Bun builder and a separately maintained runtime dependency list installed outside `bun.lock`. A successful workspace build/audit does not validate that independently installed container dependency tree.

That runtime list also omits an explicit `zod` dependency even though the service bundle imports it. Resolve and validate the container's runtime dependencies before treating the image as deployable.

There is **no `deploy-invoicing.yml` workflow** in this checkout. GitHub CI checks the workspace build; the AWS workflow deploys web/admin only. Choose the intended GCP project, image, region, secrets, and ingress policy through the deployment process before publishing a container. Do not assume the service is live because `prod` was advanced.

The admin caller sends HMAC headers but currently does not acquire a Google identity token. Cloud Run IAM-only ingress would require compatible caller authentication; HMAC and platform IAM are different layers. This README does not change or assert the current deployed ingress policy.

## Working in this folder

Read [AGENTS.md](AGENTS.md) for implementation constraints and [CLAUDE.md](CLAUDE.md) for the Claude Code entrypoint. Keep contract changes coordinated with the admin job and `packages/types`. Use the [root contribution guide](../../CONTRIBUTING.md) and [issue glossary](../../knowledge-base/ISSUES.md) for repository workflow and labels.
