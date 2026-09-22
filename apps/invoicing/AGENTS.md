# Invoicing service instructions

Applies to `apps/invoicing/**` together with the [root instructions](../../AGENTS.md).
This is a Hono service running on Node.js, not a Next.js app.

## Responsibility and contract

- `src/app.ts` exposes `GET /healthz` and `POST /v1/invoices`.
  `src/index.ts` starts the HTTP server and optional Sentry integration.
- The caller supplies the complete `invoicePdfPayloadSchema` contract from
  `packages/types/src/invoice-pdf.ts`. This app validates, renders, and stores it.
  It does not query Neon, recompute totals, collect payments, or send email.
- The caller in `apps/admin/src/app/api/jobs/invoice-pdf/route.ts` loads the invoice,
  signs the request, stores the returned URL, and coordinates invoice email.
  Coordinate changes to request/response shapes with that caller.
- Preserve raw-body HMAC verification **before JSON parsing, rendering, or storage**.
  Headers are `x-rgss-timestamp` (Unix milliseconds) and `x-rgss-signature` (hex).
  The signed text is `${timestamp}.${rawBody}`; reserialization changes the signature.
- Use shared `signRequest`/`verifyRequest` from `@rgss/business`; retain timestamp
  freshness checks and constant-time signature comparison. Do not add an unsigned
  development bypass. Invalid signatures return 401, invalid bodies 400, failures 500.
- Success is the direct `invoicePdfResultSchema` JSON object, not the web API envelope.
  Errors must not expose stack traces, credentials, invoice contents, or PDF bytes.

## Rendering and storage invariants

- `src/template/InvoiceDocument.tsx` renders an A4 vector PDF using React PDF and
  built-in Helvetica. Keep it independent of browser-only APIs and DOM components.
- Monetary values arrive as final integer paise. Reuse `formatINR` and
  `amountInWordsINR` for presentation; business tax/discount calculations stay upstream.
- `formatDateIN` already selects IST, while the template currently adds a manual
  offset before calling it. Treat that as a date-boundary risk, not a pattern to
  copy; review both functions and boundary cases when fixing date display.
- Object keys are `invoices/{issuedAt UTC year}/{invoiceNumber}.pdf`.
  A stored key is reused. Changing the key scheme affects previously issued PDFs.
- Existing-object reuse is a HEAD/GET flow, not an atomic distributed lock. Do not
  describe it as exactly-once processing or silently overwrite it with new semantics.
- In `src/storage/r2.ts`, only not-found responses mean an absent object. Preserve
  propagation of credential/network/storage errors and `application/pdf` uploads.
- The public URL is built from `R2_PUBLIC_BASE_URL`; access policy is external to
  this app. Do not claim these are expiring signed download URLs.

## Configuration and commands

Run from the **repository root** unless noted:

| Purpose | Command |
| --- | --- |
| Install locked dependencies | `bun install --frozen-lockfile` |
| Lint / typecheck / bundle | `bunx turbo run lint typecheck build --filter=@rgss/invoicing` |
| Watch and restart server | `bun run --filter=@rgss/invoicing dev` |
| Start built service | `bun run --filter=@rgss/invoicing start` |
| Related domain tests | `bunx vitest run --project business packages/business/src/invoicing` |

- `src/env.ts` is authoritative. HMAC and R2 settings are mandatory even for the
  health endpoint because environment validation runs at startup. `PORT` defaults
  to 8080; production must honor the value supplied by the hosting platform.
- The Node entrypoint does not load an env file itself. Export the values or use
  an explicit Node `--env-file` when starting `dist/index.js` directly.
- There is currently no invoicing test project in root `vitest.config.ts` and no
  workspace `test` script. If adding app tests, also wire test discovery; do not
  claim the root suite executes otherwise uncollected service tests.
- For HTTP/storage changes, cover invalid signatures, malformed payloads, existing
  object reuse, and storage failures with isolated tests. Use a test bucket for a
  deliberate live smoke test; `/healthz` alone does not verify rendering or R2.

## Packaging and deployment

- `tsup.config.ts` targets Node 22 ESM. It bundles `@rgss/*` TypeScript exports and
  keeps heavy npm dependencies external. New external imports need runtime packaging.
- Docker build context is the repository root: `docker build -f apps/invoicing/Dockerfile -t rgss-invoicing:local .`.
- Inspect the Dockerfile before deploying: its separate runtime dependency list
  and builder Bun version can drift from the workspace manifest and lockfile.
  It also omits an explicit `zod` dependency imported by the service bundle.
- There is no `deploy-invoicing.yml` workflow in this checkout. Do not describe the
  AWS deployment or Git promotion as a verified Cloud Run deployment.
- The admin caller currently sends HMAC headers, not Google identity tokens.
  Cloud Run IAM-only ingress requires compatible caller authentication before rollout;
  do not change ingress access as a side effect of application development.

See [README](README.md) for setup and the request flow, and
[deployment ownership](../../knowledge-base/deployment.md) for environment boundaries.
