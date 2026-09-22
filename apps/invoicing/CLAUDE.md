# Claude Code: invoicing

@AGENTS.md

## Working context

The root `CLAUDE.md` supplies repository rules; this import adds the invoicing
service's signing, rendering, storage, and packaging constraints.
This is a Node/Hono service. It renders final invoice values supplied by admin;
it does not own payment calculations, database writes, or customer email delivery.

## Choose the relevant boundary

- HTTP or signature behavior: `src/app.ts` and the shared request-signing helper.
- Request/response changes: the shared invoice schema and admin invoice job.
- PDF appearance: `src/template/InvoiceDocument.tsx` and `src/render.ts`.
- Storage or deployment: `src/storage/r2.ts`, `src/env.ts`, `tsup.config.ts`, and the Dockerfile.

## Validation and handoff

Use [README.md](README.md) for the HTTP contract and local setup.
Use the focused commands in the imported guide, and report separately whether
the bundle, container runtime, signed HTTP request, and stored PDF were verified.
Do not describe a successful liveness request as a successful render or deployment.
Keep shared app instructions in `AGENTS.md` rather than copying them here.
