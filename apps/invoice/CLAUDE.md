# Claude Code: invoice

@AGENTS.md

## Working context

The root `CLAUDE.md` supplies repository rules. This app contains the Cloudflare portal and the existing Node renderer. Use their entry points and tests independently.

## Choose the relevant boundary

- Portal authentication, routing and ingestion: `src/auth.ts`, `src/worker.ts`, and `src/ingest.ts`.
- Node HTTP or signature behavior: `src/node/app.ts` and the shared request-signing helper.
- Request/response changes: the shared invoice schema and admin invoice job.
- PDF appearance: `src/pdf.ts` for the Worker, `src/node/template/InvoiceDocument.tsx` for the Node renderer.
- Deployment: `wrangler.jsonc` for the Worker, `tsup.config.ts` and `Dockerfile` for Node.

## Validation and handoff

Use [README.md](README.md) for portal setup and [NODE-RENDERER.md](NODE-RENDERER.md) for the existing HTTP contract and container setup.
Use the focused commands in the imported guide, and report separately whether
the bundle, container runtime, signed HTTP request, and stored PDF were verified.
Do not describe a successful liveness request as a successful render or deployment.
Keep shared app instructions in `AGENTS.md` rather than copying them here.
