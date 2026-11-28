# Royal Glow invoice portal

This Cloudflare staging foundation accepts a signed issued-invoice event, saves an immutable snapshot in R2, and indexes the invoice in D1. An owner, manager, or accountant can view the count, total and latest 15 invoices received for an IST issue month, filter by an assigned branch, and search by booking or invoice identifier. A private PDF download renders with Takumi in a SQLite Durable Object on a cache miss.

`@rgss/invoice` also contains the [existing signed Node renderer](NODE-RENDERER.md) under `src/node`. It builds independently for the existing checkout service and container recovery. The Cloudflare Worker uses `src/worker.ts` and builds to `dist/worker`. The Node renderer builds to `dist/node`. The [Cloudflare build plan](../../design/invoicing-modernization-plan.md) is the source for shared product requirements and rollout.

## Download the CA invoice register

On **Invoice dashboard**, apply an issue month and branch, then choose **Download invoice register (CSV)**. Owners, managers, and accountants can export their assigned branches. The file includes invoice and booking references, issue dates in IST, saved issuer GSTIN, tax review status, payment method and status at issuance, and exact integer-paise amounts. Customer names and contact details are excluded. The export runs in a SQLite Durable Object and accepts up to 2,000 invoices per download. If an all-branch selection exceeds that limit, export each branch separately.

Each row identifies when its register facts first reached D1. Older invoices whose facts have yet to be projected retain their recorded issue date and total. They are marked `missing` with blank detail fields. An exact signed replay can add the missing facts without issuing an invoice or queuing email. Coverage is limited to invoices received by this portal. The register reports saved issuance facts. Current collections, refunds, and GST filing totals need their own data and checks.

Apply D1 migration `0010_invoice_register.sql` and deploy the Worker with the `InvoiceRegister` Durable Object binding. Each successful download records its actor, selection, generation time, latest receipt in scope, row and missing-fact counts, and total in paise. The download's `X-Invoice-Report-Id` header identifies that audit record.

### Download the line-tax register

Choose **Download line-tax register (CSV)** for the same branch and IST month. Join the two files by `invoice_id`. Each saved line includes its description, quantity, SAC, rate in basis points (`1800` means 18%), tax version when recorded, and amounts in integer paise. `line_amount_paise` is the saved tax-inclusive line amount before its discount. GST amounts are shown separately. The file excludes buyer and staff details.

An invoice with no saved line facts has one `missing` row with blank line fields. A saved line whose SAC, rate, or tax amounts are unavailable is `incomplete`. Saved zeros and provisional tax review status are preserved. Both CSVs are based on the invoices received by the portal and support CA review. GST filing and collection reconciliation require their own checks.

Apply D1 migration `0011_invoice_line_tax.sql` before deploying this Worker. The export uses the existing Durable Object, with a limit of 2,000 invoices and 5,000 rows per download. The audit records the invoice total once per invoice, line and missing-fact counts, and the latest line projection receipt in the selection. Exact signed replay can fill missing line facts while preserving previously saved values and email history.

### Review monthly GST

Select a month and branch on the dashboard and choose **Review monthly GST**. Opening the report directly defaults to the previous IST month. Owners, managers, and accountants see only their assigned branches. The report separates reviewed and provisional GST and groups saved amounts by issuing branch, issuer GSTIN, SAC, and rate. Zero-value membership usage is shown as a count.

An invoice contributes only when its saved paid-at-issue service or membership purchase facts and line amounts agree. A reviewed invoice requires a usable saved issuer GSTIN. Provisional invoices can appear in a missing-GSTIN group. Missing or inconsistent facts send the entire invoice to the review list. The newest 20 exceptions and up to 50 groups are shown, with counts for the full selection. Reports above 2,000 invoices or 5,000 joined rows require a smaller branch selection.

This report reuses migration `0011` and the existing report Durable Object. Compare coverage with the Admin reconciliation before relying on it for a close. The figures reflect saved issuance facts. The existing Neon GST baseline uses current payment status and a legacy fallback, so its period totals can differ. The CA still needs to review credits, current collections, refunds, and filing adjustments separately.

### Save a monthly close draft

Open **Monthly close drafts** from the dashboard or GST review. Select a branch and a closed IST month. The branch owner can save a new draft. Owners, managers, and accountants with a current grant for that branch can download the saved invoice register, line-tax register, and full JSON package. The list shows up to 25 recent versions for the selection, and saved download links still work for authorized viewers of older versions.

Apply D1 migration `0012_monthly_close_drafts.sql` before deploying the matching Worker. It records draft versions and successful download authorizations. The Worker reads the records for all three reports in one D1 batch. The package captures the issue window, receipt watermark, GST summary, and both exact CSVs and their SHA-256 hashes. Successful downloads return an `X-Invoice-Close-Sha256` header for the returned file. A repeated submission recovers the same version, including after an interrupted write. Later-issued or replayed facts can be reviewed in a new draft. Each capture supports up to 2,000 invoices, 5,000 joined line rows, and a 4 MiB package.

Each draft covers one branch and invoice issuance facts available in the portal. GSTIN-wide coverage, payment and adjustment reconciliation, and filing evidence still need review. Keep `finance-evidence/monthly-close/` private and outside all PDF expiration rules. Restore these R2 objects with the D1 metadata before relying on archived versions.

Choose **Compare with current records** on a saved version to see which invoices were added, changed, or are missing from the current register. The comparison uses both CSVs and shows whether each changed invoice differs in its header facts, tax lines, or both. It reads current data for the draft’s branch and issue month and keeps the saved version intact.

**Billing source coverage** on the same page compares the saved invoice IDs and amounts with the latest published Neon check for that branch and month. It shows the source read time and any pending, failed, or uncaptured invoice counts. Equal totals can still show a difference if the IDs or per-invoice amounts differ. The check covers up to 2,000 invoices and reconciles issuance only. Portal tax and filing review have their own checks.

**Invoice numbering** flags ranges absent between observed numbers in the saved branch and IST financial year. Service invoices, membership purchases, and zero-value sessions share the branch counter. The review shows legacy formats, unrecognized numbers, and financial-year mismatches separately. Different prefixes or repeated sequence numbers are flagged for review. An apparent gap can reflect an invoice in another month or a later receipt. Use the saved CSV and the billing register to investigate. A new draft can reflect later receipts and earlier drafts preserve their original review.

### Record CA feedback

Open **CA feedback** beside a saved version. The branch owner can record feedback received from the CA as **Reviewed** or **Changes requested**, with a short note. Owners, managers, and the CA can view the feedback for their assigned branch. Each entry retains who recorded it, the time, and the checksum of the exact draft. The page shows the 25 most recent entries for that version. Record a follow-up entry when feedback changes. A new draft has its own feedback history.

Apply D1 migration `0014_monthly_close_reviews.sql` before deploying this page. Back up the feedback table with the draft index and archived packages. The Worker verifies the private package before accepting feedback. The draft stays open for reconciliation, approval, and filing.

## Local verification

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @rgss/invoice lint
bun run --filter @rgss/invoice typecheck
bun run --filter @rgss/invoice build
bun run --filter @rgss/invoice test:staging-config
bun run --filter @rgss/invoice test:runtime
bunx vitest run --project invoice
```

The runtime test uses a local workerd process, disposable D1 and R2, synthetic issued data, a test Access signing key, and a simulated Resend endpoint. It checks signature and source validation, safe replay, scoped lookup, private regeneration, and an email retry with the same request and idempotency key. Live Google sign-in, Access policy behavior, and provider delivery require staging verification.

Set `INVOICE_RUNTIME_PDF_FIXTURES=1` when running `test:runtime` to write synthetic A4 PDFs under `dist/pdf-fixtures/` for visual inspection. The fixture set covers the original layout and the pdfcn layout with 3 and 60 lines.

## Hosted staging setup

The Worker is deployed at `invoice-staging.theroyalglow.in` with a dedicated D1 database and private R2 bucket in Asia Pacific. D1 has all 28 reviewed migrations through `0029_accountant_settlement_access.sql`. The exact Google developer sign-in and anonymous portal and PDF protection have passed. Separate Service Auth policies protect the billing and roster routes. Signed synthetic invoice ingestion, exact replay and reconciliation, and roster ingestion and replay have passed. The two service tokens were denied on each other's routes. The synthetic invoice created no email operation. The hosted renderer and its R2 cache passed the synthetic checks below. Staff and accountant browser checks and the deployed Admin publisher integration remain open.

Use Wrangler access scoped to the Royal Glow account, a disposable Neon branch, and an isolated `rehearsal-*` Admin stage for publisher rehearsal. Keep email and policy sync disabled until their staged checks pass.

The staging R2 lifecycle expires keys under `pdf-cache/` 180 days after upload. The default incomplete multipart cleanup rule is also active. The cache rule covers regenerated PDFs, including a new copy's upload after a cache miss. The signed `records/` snapshots, `finance-evidence/` files, and legacy `invoices/` objects use separate prefixes. Verify the expiration metadata on a synthetic staging PDF and run the cache-miss and snapshot restore checks before configuring any production expiry. [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

### Hosted PDF measurements

On 2026-11-28, an isolated, temporary Worker used the app's `InvoicePdf` Durable Object, existing staging records, and private R2 cache. The two fixtures had no recipients. The probe verified missing and invalid token denial before rendering. Cloudflare reported 64 ms of probe startup time.

| Fixture | Result | Worker CPU | Renderer CPU | Renderer wall time | Client round trip |
| --- | --- | ---: | ---: | ---: | ---: |
| One line | 1 A4 page, 36,320 bytes | 3 ms | 144 ms | 1,055 ms | 3,547 ms |
| 60 lines | 4 A4 pages, 49,258 bytes | 2 ms | 284 ms | 1,321 ms | 3,906 ms |

Both first requests missed the cache and subsequently read their files from R2. Ten concurrent warm downloads returned byte-identical PDFs, with a slowest client round trip of 3,173 ms. PDF inspection verified the line order, totals and page numbering. The R2 dashboard showed both cache prefixes, disabled public access and the enabled 180-day rule scoped to `pdf-cache/`. Its object details did not show a specific expiration timestamp. The probe hostname was detached and its token revoked. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

A private scheduled probe then found zero cache entries for five fresh synthetic invoices. It sent ten concurrent renderer calls, including six for the same 60-line invoice. All ten succeeded in 2,488 ms. R2 held one PDF per invoice, and the entire check took 3,457 ms. D1 showed zero email operations and zero portal grants for the batch. The temporary schedule was removed. Peak memory and the branch-authorized browser download still need verification.

The Royal Glow account has Zero Trust Free and uses the team domain `theroyalglow.cloudflareaccess.com`. To recreate the Google connection, use an External OAuth web client with `https://theroyalglow.cloudflareaccess.com` as the authorized JavaScript origin and `https://theroyalglow.cloudflareaccess.com/cdn-cgi/access/callback` as the authorized redirect URI. Enter the client ID and secret directly in Cloudflare One under **Integrations → Identity providers → Google**, then test the connection. The Google client ID is separate from the Access application audience used by Wrangler. [Cloudflare Google identity provider setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)

1. Run the [standalone rendering probe](../../scripts/probes/invoice-worker/README.md) in the Royal Glow Cloudflare account and record the hosted Free-plan measurements. Use the existing `rgss-invoice-staging` D1 database and keep the staging R2 bucket private.
2. Verify the Cloudflare Access application for `invoice-staging.theroyalglow.in` before attaching the Worker domain. Use Google as its only login method and admit the exact designated developer Gmail for bootstrap. Configure the billing service token for `/internal/v1/invoice-events` and its exact `/reconcile`, `/recover`, `/archive-original`, `/source-coverage`, `/checkout-collections`, and `/branch-settlement` subpaths. Use a separate token for `/internal/v1/staff-roster`. Check the hostname for existing DNS or Worker bindings first. [Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Google identity provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/).
3. In `apps/invoice`, use the Royal Glow deployment identity. For the named Wrangler profile, set `CLOUDFLARE_AUTH_PROFILE=rgss-invoice-staging` in the deployment shell, then verify the account with `bun run wrangler whoami`. Set `INVOICE_STAGING_ACCOUNT_ID`, `INVOICE_STAGING_D1_ID`, `INVOICE_STAGING_ACCESS_TEAM`, `INVOICE_STAGING_ACCESS_AUDIENCE`, and `INVOICE_STAGING_DEVELOPER_EMAIL`, then run `bun run --filter @rgss/invoice configure:staging`. It uses Wrangler to verify the D1 ID and name in the Royal Glow account. Continue only after the command confirms it wrote the ignored `wrangler.staging.local.json`. That config binds the dedicated resources with email, policy sync, `workers.dev`, and previews disabled.
4. In `apps/invoice`, inspect the generated bindings with `bun run wrangler deploy --dry-run --config wrangler.staging.local.json`. After reviewing and committing the numbered migrations, use the freshly verified config for `bun run wrangler d1 migrations list DB --remote --config wrangler.staging.local.json` and `bun run wrangler d1 migrations apply DB --remote --config wrangler.staging.local.json`. Wrangler can initialize its D1 migration tracking table when listing migrations for the first time. Deploy using `bun run wrangler deploy --config wrangler.staging.local.json`. Attach distinct staging Worker secrets `BILLING_EVENT_SECRET` and `INVOICE_ROSTER_SECRET` with at least 32 random characters each. Keep them in the Worker secrets store and give the matching rehearsal publishers their values through their stage secrets.
5. Set both `REHEARSAL_INVOICE_EVENTS_ORIGIN` and `REHEARSAL_INVOICE_ROSTER_ORIGIN` to the staging Worker origin. Bootstrap the developer, branches and initial owners through the roster and access flows below. With synthetic data, verify Google sign-in, owner and accountant download, cross-branch denial, revocation, signed checkout ingestion, and an identical signed replay. Measure gateway and render CPU, memory, startup, and concurrency. A successful local build establishes bundle compatibility. The hosted measurements establish Free-plan fit.

### Run the hosted staging smoke check

After deploying the staging Worker with email paused, supply `INVOICE_STAGING_BILLING_EVENT_SECRET` and the staging billing service token through `INVOICE_STAGING_BILLING_ACCESS_CLIENT_ID` and `INVOICE_STAGING_BILLING_ACCESS_CLIENT_SECRET`. Run `bun run --filter @rgss/invoice smoke:staging` from the repository root.

The check fixes the target to `invoice-staging.theroyalglow.in`, checks anonymous portal and PDF access, and uses signed reconciliation to confirm the reserved synthetic branch before writing. It sends one synthetic invoice without a recipient or delivery instruction, verifies signature rejection and exact replay, and checks the resulting invoice ID and paise total. Repeat runs reuse the same fixture. The synthetic branch stays outside the staff roster. Complete the signed-in role, private PDF rendering, and hosted resource measurements separately.

On 2026-11-28, the isolated `rgss-invoice-rehearsal` Neon project applied all 46 reviewed migrations. The Admin checkout code ran locally against that managed database and recorded a synthetic ₹500 service checkout with ₹173.33 UPI and ₹326.67 cash. The Admin outbox job deliberately dropped the first acknowledgement after Cloudflare staging accepted the event with HTTP 201. It replayed the same bytes, received HTTP 204, and marked the event published on the second attempt. Neon held one invoice and two allocations totaling 50,000 paise. Signed reconciliation and D1 confirmed one matching invoice, zero email operations, and zero portal grants on the synthetic branch. The local Worker rehearsal rendered both payment amounts and reproduced the same PDF bytes after cache eviction. The deployed AWS Admin job and QStash scheduling still need rehearsal.

### Prepare production Worker configuration

Verify the production Google-only Access application for `invoice.theroyalglow.in`, the private `rgss-invoices` bucket, the `rgss-invoice-production` D1 database, and the hostname's routing in the Royal Glow account. Use the production application's Access audience and exact bootstrap Gmail. Set `INVOICE_PRODUCTION_ACCOUNT_ID`, `INVOICE_PRODUCTION_D1_ID`, `INVOICE_PRODUCTION_ACCESS_TEAM`, `INVOICE_PRODUCTION_ACCESS_AUDIENCE`, and `INVOICE_PRODUCTION_DEVELOPER_EMAIL`.

Run `bun run --filter @rgss/invoice configure:production` with a Royal Glow Wrangler profile that can read D1 metadata. It verifies the D1 name and ID and writes the ignored `apps/invoice/wrangler.production.local.json`. The generated config disables email, Access policy sync, previews, and `workers.dev`. It uses the billing source `production`. Use that same source for the production Admin invoice and staff roster publishers when they are ready.

From `apps/invoice`, inspect the bindings with `bun run wrangler deploy --dry-run --config wrangler.production.local.json`. Use stage-specific Worker secrets and service credentials. Follow the [launch checks](../../design/invoicing-modernization-plan.md#launch-checks-for-each-increment) before applying migrations or attaching the hostname.

### Branch access administration

The portal opens the invoice dashboard for staff and the Access screen for the designated developer. At `/portal/access`, owners can assign, change and revoke manager and accountant grants for branches they own. The developer can manage all three roles across provisioned branches. Only owners, managers and accountants with current branch grants can retrieve invoices. Each successful form submission records the actor, Gmail address, branch, previous role, new role and time in the same D1 transaction as the change.

1. Apply migration `0003_portal_access.sql` to the staging D1 database. Existing grant rows are preserved. It registers their branch IDs. Owner and manager grants require a matching row in `invoice_staff_assignment` to take effect. Accountant grants require a registered branch.
2. Set `ACCESS_DEVELOPER_EMAIL` to the exact approved developer Gmail. Configure the dedicated Access application to admit this address for bootstrap. Run the [signed staff roster sync](#staff-roster-sync) to register branches and verified assignments. The developer can then grant the initial owners access on the Access screen.
3. Create a reusable Allow policy named `rgss-invoice-staging-portal` used only by this staging app. Include exact Gmail rules and require the staging Google login method. Seed the developer in the policy and confirm a successful sign-in before turning on sync. The Worker owns the policy's email membership while sync is enabled.
4. Set `ACCESS_ACCOUNT_ID`, `ACCESS_POLICY_ID`, and `ACCESS_GOOGLE_IDP_ID`. Store `ACCESS_POLICY_TOKEN` as a Worker secret scoped to administration of this individual policy. Set `ACCESS_POLICY_SYNC_ENABLED=true` after checking the staging roster against the existing policy membership. Every five minutes a single Durable Object compares current eligible Gmail addresses plus the designated developer with the policy. It preserves the other policy controls and skips writes when the lists match. [Cloudflare policy update API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/policies/methods/update/).
5. Revoke one of two branch grants in a signed-in session and verify that the revoked branch disappears while the other remains accessible. Revoke the final grant and verify immediate Worker denial, followed by removal from the edge policy on a successful sync. The Access screen shows the last confirmed membership and sync failures. During an API outage the Worker continues enforcing the current D1 grants.

### Staff roster sync

1. Apply D1 migration `0005_staff_roster.sql`. Create a Cloudflare Access Service Auth policy scoped to `/internal/v1/staff-roster`. Give Admin the corresponding service token and set the same random `INVOICE_ROSTER_SECRET` of at least 32 characters in Admin and the Worker. Use a distinct secret from `BILLING_EVENT_SECRET`.
2. Configure the [Admin publisher](../admin/README.md#background-jobs-and-integrations) using the full HTTPS `INVOICE_ROSTER_URL` and an `INVOICE_ROSTER_SOURCE` matching the Worker's `BILLING_SOURCE` (initially `staging`). SST loads `InvoiceRosterSecret`, `InvoiceRosterAccessClientId`, and `InvoiceRosterAccessClientSecret` for Admin when the URL and source are set. For an isolated SST rehearsal set `REHEARSAL_INVOICE_ROSTER_ORIGIN` to the dedicated Worker origin and provision the corresponding `Rehearsal` stage secrets. The rehearsal uses source `staging`.
3. Verify a signed job run with synthetic staff before enabling the optional QStash schedule. From `apps/admin`, preview with `bun run register-schedules --dry --jobs invoice-staff-roster`. Register the same scoped job after verifying capacity for one schedule and 96 runs per day. A registration without `--jobs` skips this schedule.

Admin reads the authoritative branch owner and manager assignments. Eligible users have a verified Gmail, a linked Google account, and the matching current role. The Worker accepts a newer signed snapshot, ignores superseded revisions, and rejects different content at the same revision. Each import updates the assignments and audits any invalidated staff grants in one D1 transaction. Even if an assignment later returns, a revoked grant needs explicit approval again. Historical branch IDs and CA grants are preserved. For immediate offboarding between sync runs or during an outage, revoke the grant directly in the portal.

### Checkout snapshots

The release candidate includes the reviewed `0045_invoice_outbox_and_checkout_payments.sql` migration, snapshot, journal, and fingerprint from commit `546a7ea`. It follows the upstream booking and push subscription migrations 0043 and 0044. Use this migration chain for rollout. The older feature worktree's draft migrations reused upstream numbers.

Service checkout, membership purchase, and membership session issuance each write one pending row in `invoice_issue_outbox` within the transaction that issues the invoice. The JSON captures the assigned number, issue time, branch and booking, seller and buyer details, line-level tax and payment facts, and the intended Takumi template version. The invoice ID also identifies its issue event.

### PDF templates

`takumi-v2` is the [pdfcn Invoice Classic adaptation](src/template/PDFCN-LICENSE.md) for newly issued snapshots. It renders the saved invoice number, issue date, parties, line-level SAC and tax facts, payment method, and totals. The `takumi-v1` layout remains available for older snapshots. The renderer uses the version in the immutable snapshot. The PDF cache key includes that snapshot's hash, so rendering a new invoice version requires no cache migration.

Deploy a Worker that supports both versions before deploying Admin and checkout code that issues `takumi-v2`. Retain a Worker version that can render both as the rollback target once any `takumi-v2` event has arrived. Pre-release staging PDFs rendered by the old boxed-HTML path may contain literal markup. Rehearse with new synthetic IDs or remove only the affected synthetic staging cache objects before verifying regeneration.

### Publish checkout snapshots

1. Configure a Cloudflare Access Service Auth policy scoped to `/internal/v1/invoice-events`. Set Admin's `INVOICE_EVENTS_URL` to that full HTTPS endpoint and `INVOICE_EVENTS_SOURCE` to the Worker's `BILLING_SOURCE`. Give Admin the service token via `INVOICE_EVENTS_ACCESS_CLIENT_ID` and `INVOICE_EVENTS_ACCESS_CLIENT_SECRET`. Set `INVOICE_EVENTS_SECRET` to the Worker's `BILLING_EVENT_SECRET`.
2. In SST, these three credentials use the stage secrets `InvoiceEventsAccessClientId`, `InvoiceEventsAccessClientSecret`, and `InvoiceEventsSecret`. For an isolated rehearsal use `REHEARSAL_INVOICE_EVENTS_ORIGIN` and the corresponding `Rehearsal` stage secrets. The rehearsal publishes source `staging`. Keep each environment pointed to one matching Worker and D1 register.
3. Verify synthetic events using the signed Admin job at `/api/jobs/invoice-outbox`. Compare invoice identifiers and paise totals between Neon and the portal and confirm the Worker creates no email intent from this job. Preview the opt-in 15-minute schedule from `apps/admin` with `bun run register-schedules --dry --jobs invoice-outbox`. Enable it after the staging check and confirming capacity for one schedule and 96 runs per day.

Each sweep claims up to eight due records. Admin saves the exact event body before sending it and reuses those bytes after failed or lost responses. Only a Worker `201` or `204` marks the record published. A transient failure leaves the invoice eligible for retry after five minutes, and an expired lease can be reclaimed. Input that fails local validation or conflicts with a stored Worker invoice is marked failed for review. Inspect the outbox state and reconcile the invoice ID and pinned body before taking action on a failed row.

The default publisher mode imports new issued invoices without a delivery intent while the existing Admin invoice job serves customers. Historical records require a separately reviewed backfill. The single-branch handoff is opt-in and described below.

### Reconcile a closed invoice month

Apply D1 migration `0006_invoice_reconciliation_index.sql` and deploy the Worker summary route at `/internal/v1/invoice-events/reconcile`. Give the Admin billing service token access to that exact path as well as the issue event path. The two requests use the same environment-specific billing secret and distinct signed payload types.

From an authenticated Admin developer session, open `/api/invoice-reconciliation?month=YYYY-MM`. The default is the previous month in India Standard Time. This read-only JSON report compares stored invoice counts and integer-paise amounts by issuing branch. Neon counts uncaptured historical invoices separately and uses their recorded creation time when the original issue time is missing. The report identifies published, pending, failed, and uncaptured counts. Delta is the portal figure minus the Neon figure.

A month is `matched` when the totals agree and all source invoices are marked published. Equal totals with incomplete publication coverage report `incomplete`. Any branch delta reports `different`. An empty period reports `empty`. The report reads Neon and D1 independently. Compare again after the queue has drained if publishing was in progress. This aggregate check can establish count and amount agreement. Per-invoice identity, R2 integrity, GST, collections, and approved historical backfill have separate checks.

For an exact check, open `/api/invoice-reconciliation?month=YYYY-MM&branchId=<branch-id>` from the same authenticated Admin developer session. The Worker returns invoice IDs and integer paise from that branch's closed IST month over the same signed service route. Admin compares these against Neon and lists missing IDs on either side, amount differences, and incomplete publication. Use both checks before promoting a shadow import. The branch check supports up to 2,000 invoices per side. It reads the two indexes and leaves uploads and delivery queues untouched.

#### Recover one previously published invoice

Apply D1 migration `0027_invoice_recovery.sql` before deploying the matching Worker and Admin. Give the billing service token access to `POST /internal/v1/invoice-events/recover`. From the Admin developer session, send a same-origin JSON `POST /api/invoice-reconciliation` for the invoice and branch identified during reconciliation.

```json
{"report":"recover_invoice","branchId":"branch-1","invoiceId":"invoice-42","reason":"Missing from the branch register"}
```

Admin uses the exact event bytes previously acknowledged by the Worker and records the recovery request in the audit log. The Worker can restore a missing invoice index, snapshot or report facts without allocating a new invoice number or creating any emails. A conflict with saved records requires review. Automatic invoices with missing delivery history stay unavailable for resend until the original initial-send record is restored and reconciled. Review restored delivery records before starting queue processing after an outage. Keep email paused if rolling back to an earlier Worker while any automatic delivery histories remain incomplete. Records without an acknowledged event still require a separate historical backfill.

#### Inventory historical records for backfill

After applying the reviewed Neon outbox migrations, open `/api/invoice-reconciliation?report=backfill_inventory&month=YYYY-MM&branchId=<branch-id>` from an authenticated Admin developer session. The source-only report reads up to 2,000 invoices for one closed IST branch month and works before the Worker is configured. It shows saved invoice IDs, numbers and amounts, distinguishes the saved tax point from the creation-time fallback, and indicates whether a prior event or PDF reference exists.

In Admin, **Integrations → Invoice recovery** provides the same inventory. Select a branch and a closed month to load it. Choose **Compare with portal** to see individual differences and amounts for that branch and month. The inventory remains available if the portal connection is unavailable. Review a saved event or stored original before confirming the individual action with a reason.

Verify the pinned event before using the recovery endpoint. Review pending or failed events through the existing outbox process. For uncaptured invoices, locate the archived original and confirm it against the billing record before planning an import. A recorded reference indicates where to look; private originals can exist without one. The inventory skips customer details and raw PDF URLs.

#### Archive a historical original PDF

Apply D1 migration `0028_original_invoice_archive.sql`, deploy the matching Worker and Admin, and allow the billing service token to call `POST /internal/v1/invoice-events/archive-original`. From an authenticated Admin developer session, send a same-origin JSON `POST /api/invoice-reconciliation` for an uncaptured invoice selected during backfill review.

```json
{"report":"archive_original","branchId":"branch-1","invoiceId":"invoice-42","reason":"Verified historical record"}
```

Admin requests the existing PDF from the configured legacy renderer's signed download route. It uses the stored number and date to resolve the renderer's object key and rejects collisions in the normalized key for that UTC year. The renderer reads its existing storage. If its saved PDF is available and no larger than 1 MiB, the Worker keeps an integrity-checked copy under `original-archive/` in private R2. The Admin audit records the selected invoice, branch and reason. Replaying the same request verifies the copy and can repair a missing object.

In staging, a real synthetic PDF from the Node renderer returned HTTP 201 on archive and 204 on exact replay. The Worker rejected the same invoice with changed facts, and rejected an unregistered branch or an issued invoice ID. D1 recorded one matching archive, zero issued invoices and zero email operations. Cloudflare Access denied the anonymous download.

Staff and CA users with the current branch grant can find the archived original in **Find an invoice** using its booking ID, booking number or invoice number. A creation-time fallback appears as a billing record date. The archive stays separate from invoice and GST registers, payment and refund views, and email delivery. A captured invoice's normal search result takes precedence if the portal later receives its exact source snapshot.

#### Publish a billing source check

Apply D1 migration `0013_invoice_source_coverage.sql` and deploy the matching Worker before enabling this action in Admin. Extend the billing service token's Access policy to allow `POST /internal/v1/invoice-events/source-coverage`. The Worker verifies the raw HMAC and expected environment on that route.

In Admin, open **Integrations → Publish invoice reports**. Choose a branch, a closed IST month, and **Billing source coverage**, then publish. Admin reads Neon once and signs the state counts, total paise, and SHA-256 of the ordered invoice ID and amount pairs. It sends the digest and counts without customer details. The Worker uses the latest observation and keeps the saved drafts intact. Publish a new check after a replay or late issue to review current billing coverage. The Admin audit log records successful updates with the actor, report, branch, month, and observation time.

### Review recorded service collections

New positive paid service checkouts record a receipt and invoice allocation for each payment method in the same Neon transaction that issues the invoice. Admin can split the exact total across two distinct methods chosen from cash, UPI and card. Both amounts must be positive integer paise. The issued snapshot keeps both methods and amounts for the PDFs. The invoice register CSV uses `split` in its existing payment method column. Zero-value checkouts create no receipt. Earlier invoices keep their existing records.

Apply the reviewed Neon migration `0045_invoice_outbox_and_checkout_payments.sql` and D1 migrations `0015_checkout_collections.sql` and `0016_invoice_split_payment.sql` before rolling out the corresponding services. Deploy the matching Worker and signed Node renderer before the Admin version that records split payments. Retain versions of both renderers that support split payment after the first split checkout. Rehearse one cash and UPI checkout with synthetic data. Confirm the two receipts and allocations sum to one issued invoice, the PDF lists both amounts, the register marks it `split`, and a signed replay leaves the invoice and allocations intact.

Use `defer_production_deploy` when promoting this release to `prod`. Checkout writes to the new Neon tables even while the publisher is disabled. Apply the reviewed migration and verify the renderers before dispatching the AWS workflow for the promoted commit. [Production promotion guide](../../knowledge-base/branch-promotions.md)

Grant the billing service token access to `POST /internal/v1/invoice-events/checkout-collections`. From **Integrations → Publish invoice reports** in Admin, select the branch, IST month, and **Recorded service collections**. Current-month snapshots include receipts recorded before the observation cutoff. The report carries only receipt dates in IST, tender labels, counts, and amounts in paise. It leaves individual account and payment details in Neon.

Open **Recorded service collections** on the dashboard and select an assigned branch and receipt month. The report distinguishes unpublished data from a published snapshot with zero recorded receipts. A split checkout contributes one receipt and its amount to each payment method. Review historical receipts, membership payments, refunds, and bank payouts through their own records.

### Prepare a daily cash close draft

Apply D1 migration `0017_cash_close_drafts.sql` before deploying the matching Worker. Open **Daily cash close** and select one branch and one completed IST business date. Publish a collections snapshot for that month using the reconciliation action above. The snapshot must have been read after the selected IST date. A published snapshot can show zero recorded cash for older days with incomplete ledger coverage. A newer snapshot may change the total for an earlier day.

An owner or manager enters opening cash, other cash receipts, refunds, payouts, bank deposits out of the drawer, and the physical amount counted. Enter verified receipts missing from the ledger under other cash received. The draft adds signed service cash receipts to the opening float and other cash, then subtracts the recorded outflows. A variance is counted cash minus expected cash. A reason is required for a variance or a subsequent revision. Each saved draft retains its source read time, amounts, and author. Accountants can view their assigned branch drafts.

Apply `0018_cash_close_approvals.sql` with the matching Worker. A branch owner can approve the latest revision after reviewing its cash figures and the recorded reason for any variance. An approval note is required when the cash differs from the expected amount. If a new collections snapshot changes the day's service cash, save and review a new draft before approving. A new revision needs its own approval. Previous approvals stay visible with their original drafts, approvers, notes, and times.

Apply `0019_cash_deposit_evidence.sql` and `0020_cash_deposit_corrections.sql` with the matching Worker. For an approved close with a cash deposit, the owner can use **Link bank credit** to enter the statement's credit date, transaction reference, and credited amount. The single credit must equal the full deposit on the approved revision. Each reference can have one active link per environment, even across branches. If a later approved revision changes the deposit total, the page flags the difference and keeps the saved link.

A branch owner can void a mistaken link with a reason. The original reference, amount, revision, and recorder remain visible with the correction reason, owner, and time. Voiding releases the reference. An owner can record a replacement against an eligible approved close. Retrying the voided link's original submission keeps it voided.

Include `invoice_cash_close_draft`, `invoice_cash_close_approval`, and `invoice_cash_deposit_evidence` together in D1 backup and restore rehearsals. This workflow records a manually verified statement entry. Partial or combined deposits and automated payout matching remain open.

### Review daily cash closes by month

Open **Monthly cash close review** on the dashboard and choose one assigned branch and an IST month. The review includes completed dates where the service ledger recorded cash or staff saved a cash-close draft. A date with recorded cash and no draft needs a close. A draft without a usable collections snapshot shows that its source is unavailable. Days with neither record stay outside the list.

The report links each date to its daily close. It shows the latest draft's approval, cash shortage or overage, changes to recorded service cash, and the active bank credit against the saved deposit. An earlier approval or bank link remains in the daily history. The review is live and branch-scoped.

Apply D1 migration `0021_cash_close_month_exports.sql` to enable **Download cash-close CSV**. It exports the selected branch and month with one row per date shown. Amounts are integer paise, with blanks for unavailable figures. The file includes expected cash, counted cash, variance, source and approval status, and the amount and revision of an active bank credit. Customer details, staff addresses, bank references, and notes stay out of the download.

The Worker records the download's actor, scope, source observation, schema version, row count, and CSV checksum in `invoice_cash_close_month_export`. The response's `X-Invoice-Report-Id` identifies the audit record. Include this table in D1 backups alongside the cash close and deposit history.

### Import bank and provider statements

In **Bank and provider statements**, select one branch and use a consistent account or provider label. Owners and managers can preview and confirm an import. The CA can review imported rows for assigned branches. Use a UTF-8 CSV with this header and up to 100 transactions or 32 KiB per file.

```csv
branch_id,posted_on,reference,direction,amount_paise
branch-1,2025-12-15,DEPOSIT-101,credit,250000
```

Use the assigned branch ID on every row, a posted date, the bank or provider reference, `credit` or `debit`, and positive whole paise. Omit account numbers from the label. Keep each file to one account and one branch. Migration `0023_statement_imports.sql` stores the normalized rows and import receipt. Reimporting the same rows for the same account reopens the previous receipt. Conflicting references reject the entire import.

The importer suggests a cash-close match when branch, date, amount and reference agree. Staff verify the receiving account before recording or correcting the link in cash close. Native bank mappings, settlement fees, combined payouts and matching individual electronic receipts need account-specific fixtures.

### Review refund requests

Use **Refund review** on a booking or invoice search result. Owners and managers can select the original tender and affected service lines on a verified paid service invoice, enter an amount and record the reason. Pending and approved requests reserve an amount against the saved tender. A rejected request releases that reservation. The branch owner can record one approval or rejection with a note. Accountants can read request history for their assigned branches.

Apply `0025_refund_requests.sql`. This workflow saves the request, approval decision and original invoice snapshot reference. The billing ledger must confirm the current refundable balance, record the financial movement and link any separate adjustment document. The portal's tender limit is based on the amount paid at issuance.

### Review a GST registration across assigned branches

Open **GSTIN close review** and select a closed IST month and issuer GSTIN. Each assigned branch displays the latest frozen monthly draft, saved reviewed taxes for the selected GSTIN when those facts are complete, recorded CA feedback and the comparison with the signed billing source check. A missing branch draft, unavailable review data, and a source check that predates the draft remain visible.

Registration coverage requires effective-dated branch-to-GSTIN assignments. The review displays the branches granted to the current user and leaves registration-wide approval and external filing evidence pending.

### Track supplier bills and payments

Under **Supplier bills and payments**, choose a branch and the bill's IST month. Owners and managers can enter a bill once, recording any known GST amount as shown on the supplier document. Attach the original PDF, up to 1 MiB, as private evidence. The branch owner records outgoing payments and can void a mistaken bill or payment with a reason. A bill with active payments can be voided after those payment entries are corrected. The register shows billed cost, active payments and remaining balance separately.

Apply `0022_supplier_expenses.sql`. An accountant can read supplier bills, payments and evidence in an assigned branch and download an audited branch/month CSV. The CSV preserves missing GST as a blank amount. Input credit eligibility and GSTR-2B matching remain part of the CA review.

### Review branch settlement activity

Apply migrations through `0029_accountant_settlement_access.sql` before deploying the matching Worker and Admin code. Give the billing service token access to `POST /internal/v1/invoice-events/branch-settlement`. After the signed staff roster has registered the branch, an Admin developer can publish a snapshot under **Integrations → Publish invoice reports → Branch settlement activity** for the branch and IST month.

Open **Branch settlement activity** and select the same branch and month. Owners can see amounts due and receivable alongside membership minutes and Gems. Managers see minutes and Gems for their assigned branch. In **Manage branch access**, the branch owner can choose **Allow settlement access** for a current accountant. The accountant can then read those totals for that branch. The owner can remove the permission immediately, and changing or revoking the accountant role also removes it. The branch access history records explicit settlement grants and removals.

These are activity totals by IST ledger creation date, including reversals. Formal settlement statements, counterparty details and payment recording stay in Admin. Refresh the snapshot when the source changes.

For the current IST month, publish a fresh branch settlement snapshot to see **Membership balances**. The figures cover active memberships sold by the branch as of the snapshot time. Held minutes are reserved for sessions. Used minutes account for corrections. Available minutes exclude held and used minutes. The expiry figure counts available minutes on memberships expiring within the following 30 days. Admin holds the underlying membership and session details.

Deploy the Worker that supports membership balances before deploying the Admin publisher. Keep that Worker version available for rollback after a balance snapshot has been stored. Previously stored snapshots continue to load and can be refreshed for a current balance.

Staging accepted and replayed a signed synthetic current-month balance. It rejected inconsistent totals and a balance submitted as a closed-month report. The actual Admin route also read a disposable PostgreSQL branch, signed and published the expected balances to staging, and wrote one audit record after acknowledgement. D1 held the exact aggregate with no staff grants for the synthetic branch. The deployed Admin instance, managed Neon and staff sign-in still need a hosted check.

### Restore invoice and finance records

Maintain a consistent D1 export and an independent private copy of R2 `records/`, `finance-evidence/`, `original-archive/`, and any retained original documents under `invoices/`. Record the environment, export time, schema version or migration list, object keys, byte lengths and SHA-256 checksums. These copies contain private finance and customer data. The `pdf-cache/` prefix can be rebuilt from verified snapshots.

The synthetic `bun run --filter @rgss/invoice test:runtime` suite rehearses a local D1 SQL export and restore, compares finance rows and access grants, and verifies copies of invoice snapshots and private finance evidence in a different local R2 binding. Run it after `bun run --filter @rgss/invoice build:worker`. Hosted recovery needs a designated private backup location and a separate staging exercise.

Pause the relevant publishers, portal writes and customer delivery during a planned capture or recovery. Export D1 to SQL with the environment's reviewed Wrangler configuration. Restore into a new isolated database and private bucket first, then confirm migration history, grants, issued snapshots, monthly drafts, statement and supplier histories, refund requests and delivery receipts. Check the hash of each retained object before restoring its original key. Enable delivery after checking the restored receipts and billing cutoff against the publisher. [Cloudflare D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

Cloudflare also provides short-term D1 Time Travel for an in-place rewind. It affects the existing database and requires a separate recovery decision. Preserve the prior bookmark and independent backup. [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

### Automatic email queue

An issued service event can include `delivery: { "mode": "automatic", "completed": true, "paid": true }`. Only the signed billing producer can request this. The invoice must have a booking, reviewed tax facts, and a customer email. Omit `delivery` for backfills and import-only events. D1 records the initial email operation in the same batch as the invoice index. Replaying the same event keeps the original operation.

The scheduled sweep runs every five minutes. Actual sending is off until `INVOICE_EMAIL_ENABLED=true`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` are configured. Each attempt requires a private PDF attachment. The queue pins a hash of the provider request, caps attempts, and stops automatic retries 12 hours after the first claim so they stay inside Resend's documented 24-hour idempotency window. `accepted` means Resend returned a provider ID. `uncertain` requires reconciliation before a manual resend. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

#### Rehearse a single-branch email cutover

After confirming the isolated Worker, signed publisher, and Resend callbacks, deploy the ownership-aware checkout and legacy invoice job before the planned cutoff. Use `REHEARSAL_INVOICE_AUTOMATIC_EMAIL_BRANCH_ID` and `REHEARSAL_INVOICE_AUTOMATIC_EMAIL_START_AT` in the SST rehearsal deploy environment. The production equivalents omit the `REHEARSAL_` prefix and stay unset until the rehearsal and legacy delivery review pass. Set both a single branch ID and an explicit UTC timestamp.

Eligible service invoices issued at or after the cutoff store Worker email ownership at checkout. The legacy job keeps rendering PDFs for Admin. It skips email for Worker-owned invoices. Disable the selection to stop handing off new invoices. Previously assigned invoices keep their owner and pinned publish bytes. Drain and reconcile those operations before any rollback that removes the ownership check. The 15-minute outbox and five-minute delivery sweeps can add up to about 20 minutes before attempts during normal scheduled operation. Measure latency and retry behavior in staging before accepting the delivery target.

### Resend an archived invoice

An owner or manager can find a booking in **Find invoice**, select **Email invoice**, verify the saved email, and choose **Queue invoice email**. The action applies to assigned branches and requires a paid service invoice with reviewed tax and a customer email captured at issuance. The accountant can download the PDF. The confirmation form queues delivery to the saved address and keeps the invoice snapshot intact. The delivery job regenerates a missing cached PDF before attaching it.

Imported invoices without a Worker delivery intent keep their history view and PDF download. Their resend action is paused by default because the previous sender's history is outside the portal. Set `INVOICE_LEGACY_RESEND_ENABLED=true` after reviewing the legacy delivery and backfill process. Worker-owned automatic invoices use the usual resend eligibility and delivery status checks.

Each confirmation creates one delivery operation. Repeated submissions of that confirmation reuse the operation. The invoice email history shows who requested the resend, when they requested it, and the result. **Accepted by email provider** means Resend accepted the attachment for sending. **Delivered to receiving mail server** is the stronger confirmation supplied by a callback. In-progress, delayed, uncertain, suppressed, and spam-reported emails block new requests for the same invoice. The branch owner can record evidence for an uncertain send and verify it through a signed Resend replay.

Keep dispatch paused and the billing publisher stopped while applying D1 migration `0007_invoice_delivery_operations.sql` and rolling out the matching Worker. The migration preserves existing attempts, provider receipts, and initial send keys. Resume publishing after the operation-aware Worker is live. Roll back delivery only to a Worker compatible with migration `0007`. Before enabling real email, validate staging and verify legacy send ownership using the [implementation plan](../../design/invoicing-modernization-plan.md).

Hosted verification and historical backfill remain pending. Collection and GST metrics depend on the corresponding billing projections. Scope R2 expiry to `pdf-cache/` after the retention and restore checks pass.

### Verify Resend callbacks in staging

1. Apply `0008_invoice_email_callbacks.sql` to the staging D1 database and deploy the callback-aware Worker. The migration keeps existing attempts and provider receipt IDs. Before rolling back below this Worker version, pause dispatch if any tagged operations are still open. Older versions cannot reproduce the tagged request body for those attempts.
2. Configure Resend to use `POST /webhooks/resend` with an environment-specific `RESEND_WEBHOOK_SECRET` stored as a Worker secret. If the account already has a shared receiver, route its invoice callbacks with the original request bytes and matching `svix-id`, `svix-timestamp`, and `svix-signature` headers. Configure only the callback path for provider access. The portal stays behind Google Access and billing paths keep their service-token policies.
3. Subscribe to `email.sent`, `email.delivery_delayed`, `email.delivered`, `email.bounced`, `email.failed`, `email.suppressed`, and `email.complained`. Verify a synthetic invoice sent to an approved staging email address, then replay a signed event. Check the webhook response, operation history, and delivery result before enabling real sends. [Resend event types](https://resend.com/docs/webhooks/event-types) and [signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests).

The callback records the provider email ID, event ID, linked operation, outcome, and time. New sends carry a stable random tag that can attach a callback to its operation before the HTTP send response arrives. Previously pinned requests keep their original JSON and use the stored provider ID once available. Duplicate deliveries of webhook events reuse the original receipt. A late sent or delayed event cannot replace a final outcome. A suppression or spam report also cancels queued sends for that invoice whose provider requests have yet to be pinned.

### Review an uncertain send

Apply D1 migration `0009_invoice_delivery_reviews.sql` before deploying the review screen. On the invoice email history, the branch owner can see the delivery reference of an uncertain send. In the Resend dashboard, find the webhook message with the matching `data.tags.rgss_invoice_delivery` reference, record its `data.email_id` in the portal, and replay the webhook message. The portal audits who recorded the candidate and whether it matches the signed result. [Resend webhook replay](https://resend.com/docs/webhooks/retries-and-replays#manual-replays).

Recording an email ID never changes delivery status, releases a hold, or sends an email. Only a correctly correlated provider callback updates the operation. A missing webhook message or an older send with no delivery reference stays uncertain. Review works with sending paused and uses the webhook signing secret already configured for the environment.
