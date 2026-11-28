# Invoice Worker runtime probe

This isolated probe measures the Takumi WebAssembly PDF path in a Cloudflare Worker and SQLite Durable Object. It accepts two fixed synthetic fixtures and requires a probe token. The fixture layout uses Takumi directly. The production pdfcn layout, Google Access, checkout integration, R2 storage, and email will need their own end-to-end checks.

## Run locally

Use the repository's Bun version and Node 22.12 or later. From this directory, run `bun install --frozen-lockfile --ignore-scripts`. Set a fresh random token of at least 32 characters in the ignored `.dev.vars` file as `INVOICE_PROBE_TOKEN`. Set the same value in the client shell environment through your local secret manager or terminal session.

1. Run `bun run dev` and wait for Wrangler to report readiness on `127.0.0.1:8787`.
2. In another shell, run `bun run verify`. Set `INVOICE_PROBE_PORT` in that shell if you started Wrangler with a different port.
3. The verifier checks the PDF signature, authorization failures, allowed routes, and a burst of ten concurrent requests. For visual inspection, download `/fixtures/normal` and `/fixtures/large` from your local probe with the same Bearer token. Run `pdfinfo` and inspect the pages to verify pagination and script rendering.
4. Run `bun run bundle` to check the Wrangler bundle without deploying. To type-check, run `bun run wrangler types .wrangler/worker-configuration.d.ts` here, then `bun run tsc --project scripts/probes/invoice-worker/tsconfig.json` from the repository root.

## Hosted Free-plan proof

Use a Wrangler identity with Worker deployment permission in the Royal Glow Cloudflare account. Confirm the account and plan before creating a disposable, isolated deployment. The committed config has public `workers.dev` and previews disabled. Create an environment-specific probe config and a reachable test route only for the measurement. Configure `INVOICE_PROBE_TOKEN` as a Worker secret before making the route reachable. The probe fails closed until that secret is present.

Set `INVOICE_PROBE_URL` to the hosted HTTPS origin and rerun `bun run verify` with the same token. Record cold and warm timings plus Cloudflare invocation CPU and limit errors. Keep the staging probe separate from production routes and resources. Remove its temporary route and revoke its secret after the run.

## Local evidence from 2026-11-26

| Check | Result |
| --- | --- |
| Regular invoice | 1 A4 page, 3 lines, 39,863 bytes |
| Large invoice | 3 A4 pages, 60 lines, 48,088 bytes |
| Text inspection | Selectable line numbers and rupee totals, logos and Kannada, Telugu, and Devanagari samples visually checked |
| Concurrent traffic | 10 requests passed. Slowest local round trip 993 ms in this run |
| Wrangler dry run | 2,141.03 KiB gzip |

These results describe local `workerd` and a synthetic layout. Hosted Free-plan CPU and memory are pending. The full-resolution logo produced nearly 2 MB per PDF, so the probe uses the existing 192 px Royal Glow mark.
