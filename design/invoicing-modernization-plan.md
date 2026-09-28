# Invoicing modernization: AWS and Takumi

Status: planning draft. Hosting selected by the user on 2026-09-28; implementation and deployment have not started.

## Confirmed direction

- Use pdfcn's Takumi components for the invoice design and `takumi-pdf` for rendering.
- Host invoicing on AWS alongside the existing application infrastructure. This replaces the earlier Netlify proposal and the service's historical Cloud Run target.
- Keep the renderer portable: the same release must run on AWS Lambda and as a standalone Node.js container on Render or Railway, without changes to invoice logic, templates, or the HTTP contract.
- Size for 30-50 invoices per day, with capacity for retries and occasional concurrent checkouts.
- Target zero additional recurring cost within available allowances. AWS usage billing does not provide a guaranteed zero-cost boundary; verify account-wide usage and related service charges before rollout.
- Complete the concrete behavior and implementation plan before development.

## Current implementation baseline

- `apps/invoicing` is a Hono/Node service using React PDF. It verifies raw-body HMAC signatures, validates the shared payload, and renders or reuses a PDF in R2.
- `apps/admin/src/app/api/jobs/invoice-pdf/route.ts` receives signed QStash jobs, builds the payload, calls the renderer, persists its URL, and sends email. Its renderer timeout is 10 seconds. Several rendering failures return success after attempting email without an attachment.
- `sst.config.ts` provisions web and admin on AWS Lambda in `ap-southeast-1` through SST. It already supplies the invoice HMAC secret and optional service URL to the applications.
- `.github/workflows/deploy-aws.yml` does not currently include `apps/invoicing/**` in its deployment path triggers.
- The user reports web and CMS are hosted on AWS. The checkout still defines CMS on Render in `infra/render/render.yaml`. Verify the live deployment and correct documentation when appropriate; do not migrate CMS as part of invoicing work.

## Proposed AWS architecture

```text
Booking / membership invoice creation
  -> existing durable job flow
  -> admin invoice job
  -> HMAC-signed request to a dedicated AWS Lambda
  -> pdfcn / Takumi renders the validated invoice
  -> existing Cloudflare R2 stores the PDF
  -> admin persists the result and coordinates email
```

Provision the dedicated renderer through the existing SST stack in Singapore. Start by evaluating a Node.js Lambda with 1 GB memory, on-demand execution, bundled fonts and WASM, and a Lambda-compatible Hono entry point. Select the supported Node runtime and CPU architecture after checking the pinned dependencies and a real Lambda packaging test.

Keep final money calculations, invoice creation, and payment recording upstream. Preserve the shared request/result contract and raw-body HMAC checks. Design the Lambda invocation endpoint and access policy explicitly; do not expose an unsigned rendering endpoint. Retain R2 as the storage target. No new always-running server, provisioned concurrency, or VPC/NAT infrastructure is proposed.

## Portability and recovery requirements

AWS is the primary deployment target, not a dependency of the rendering core. Keep one Hono application containing validation, signature verification, render orchestration, and storage access. Provide two thin entry points: a Lambda handler and a normal Node.js HTTP server that listens on the platform's `PORT` and `0.0.0.0`. Neither entry point may contain invoice business rules.

| Concern | Portable design |
| --- | --- |
| Rendering | The same pdfcn components, Takumi version, fonts, logos, and WASM assets are packaged with every target. No asset downloads are required during rendering. |
| HTTP contract | Preserve `POST /v1/invoices`, raw-body HMAC headers, payload validation, and result/error semantics across providers. Retain `GET /healthz` as a liveness check. |
| Secrets | A shared environment-variable contract works on all hosts. AWS may inject secrets at deployment, but the rendering core must not fetch configuration from AWS-specific services at runtime. |
| Storage | Use the existing R2 S3-compatible API with scoped credentials. All deployments for the same environment use the same bucket and object-key rules. Preserve old invoice objects and URLs. |
| Application dependencies | The renderer has no database, queue, payment, or email dependency. The caller supplies the complete validated invoice data. |
| Packaging | Produce a Lambda artifact and a standalone OCI image from the same commit and locked dependency graph. Repair the existing Dockerfile's separately maintained, unlocked runtime dependency list. |
| Deployment | Commit tested Render and Railway deployment configuration and document their required environment variables, build context, start command, health path, and rollout procedure. |
| Release recovery | Retain a tested container artifact in a registry accessible independently of AWS, together with the release identifier and configuration inventory. Secret values remain in an approved secret store, never in the image or repository. |

### Initial recovery mode: manual provider switch

1. Deploy the last validated container release on Render or Railway with the same environment-specific HMAC secret, R2 settings, and template assets.
2. Verify liveness, signature rejection, and a synthetic render/store/reuse round trip using designated test data. A health response alone is insufficient.
3. Switch the admin caller's `INVOICING_SERVICE_URL` to the replacement endpoint and apply the configuration change through its deployment mechanism. Treat the URL as runtime deployment configuration, not a hard-coded provider URL. Rotate a suspected-compromised secret on both sides instead of copying it.
4. Replay pending/failed PDF jobs through the existing authorized job mechanism. Retries must reuse the originally issued invoice data and must not create another invoice or send duplicate receipts.
5. Verify a successful invoice delivery, then resume normal processing. Record the active host and retain a tested rollback path.

Before rollout, define retryable rendering failures and a durable record of pending PDF work; the current successful no-attachment fallback can otherwise leave nothing to replay. Align renderer, caller, and job timeouts with measured limits on each target. Make simultaneous retries safe across hosts: an existing issued PDF must not be overwritten. Specify and test conditional object creation and conflict handling rather than treating a HEAD check as a distributed lock.

This design supports moving the renderer without rewriting it. A standby deployment is not maintained continuously by default, so recovery includes provider provisioning and configuration time. Automatic routing/fallback can be a later scoped enhancement.

A renderer move alone does not recover an AWS-wide application outage: the admin caller is also currently deployed on AWS. If it is unavailable, updating its configuration and delivering jobs may need to wait for recovery or require a separately planned portable dispatcher/admin deployment. R2 and the existing job/email providers also remain shared dependencies. Keep broader application disaster recovery outside this renderer migration unless explicitly added to scope.

## Development sequence for the final plan

1. Verify the current deployment baseline, isolated working branch, AWS account allowances, and invoice-service configuration without logging secrets.
2. Build a representative pdfcn/Takumi template and verify selectable text, the rupee glyph, fonts, logo, long names, many line items, page breaks, and totals.
3. Validate both the Lambda bundle and standalone container: WASM/font loading, cold starts, memory, PDF size, and render duration. Use a common test suite and compatible renderer/admin timeout budgets.
4. Add the Lambda resource, scoped secrets, environment wiring, deployment triggers, and health/render checks to the existing infrastructure workflow. Prepare Render/Railway deployment configuration and retain the portable release artifact.
5. Complete integration and failure handling: stored-object reuse, concurrent requests, retryable PDF failures, email deduplication, and visible delivery status.
6. Run isolated contract, signature, storage-failure, rendering, and admin integration tests; wire service tests into the actual test runner. Verify a synthetic invoice in a designated test environment before production rollout. Rehearse switching from Lambda to a container endpoint, replaying a failed job, and reusing a PDF created on the other host. Record which provider deployments were actually verified; local Docker testing does not prove Render/Railway deployment.

## Decisions still needed before the plan is complete

- Final branded layout and required fields for service, membership purchase, and membership session documents.
- Download authorization and treatment of existing PDF URLs; the current code constructs public URLs.
- Template versioning and retention of already-issued PDFs; current object reuse ignores template version.
- Retry and email-delivery policy when rendering or sending fails.
- Seller details and tax-field configuration, including the currently absent seller GSTIN in the admin render payload.
- Acceptance thresholds for render duration, memory, concurrency, and monthly usage, based on measured results.

## Cost verification

Illustration only: 1,500 invocations at 1 GB for 5 seconds each consume 7,500 GB-seconds per 30-day month, before retries and orchestration. AWS currently advertises a Lambda free tier of 1 million requests and 400,000 GB-seconds monthly. These are not an invoice-service reservation: existing account usage, eligibility, logs, storage, data transfer, and deployment resources must also be accounted for. Budget notifications are not a hard spending cap.

## References

- [Original billing design](billing-invoice-flow.md)
- [Current invoicing service](../apps/invoicing/README.md)
- [SST infrastructure](../sst.config.ts)
- [AWS deployment workflow](../.github/workflows/deploy-aws.yml)
- [Takumi PDF documentation](https://takumi.kane.tw/docs/pdf)
- [pdfcn](https://www.pdfcn.dev/)
- [SST AWS Function](https://sst.dev/docs/component/aws/function/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
