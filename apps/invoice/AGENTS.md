# Invoice portal instructions

Read the [repository instructions](../../AGENTS.md), [app README](README.md), and [build plan](../../design/invoicing-modernization-plan.md). This workspace contains the Cloudflare portal and the compatible Node renderer under `src/node`.

- Keep browser identity checks and current D1 branch grants ahead of invoice data and file access. Keep machine ingestion separate, with raw-body signature validation before parsing.
- Treat Neon-issued snapshots as financial records. Validate them, preserve saved paise and tax facts, and keep regeneration out of invoice numbering and payment changes.
- Use disposable local bindings for tests. Hosted staging must use dedicated D1 and R2 resources. Production lifecycle rules require the retention and restore checks in the plan.
- Run the app lint, typecheck and dry-run build. Run `test:runtime` against the latest local bundle when changing ingestion, authorization, or rendering.

## Node renderer compatibility

- Preserve the existing health, signed render and signed download routes in `src/node/app.ts`. Verify the raw HMAC body and timestamp with shared helpers before parsing or storage. Keep the direct shared response shapes and avoid leaking credentials, customer content, or stack traces in errors.
- Render saved paise and GST facts. Use the saved issue instant directly with `formatDateIN`. The existing React PDF template uses Helvetica and the `INR` label.
- Preserve UTC issue-year and normalized invoice number keys under `invoices/`. Reuse existing objects and keep conditional writes. Treat only missing objects as absent, and propagate unexpected storage failures. Keep private download behavior and legacy stored URLs compatible.
- Run `bunx vitest run --project invoice` for the Node renderer. Build its container from the repository root using `apps/invoice/Dockerfile`. The Node renderer uses its own `tsconfig.node.json`, `src/node/env.ts`, and `dist/node` output. See [the Node renderer guide](NODE-RENDERER.md) for credentials, callers, packaging, and runtime checks.
