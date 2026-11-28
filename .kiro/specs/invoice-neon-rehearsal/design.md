# Invoice rollout design

Admin writes each immutable issue snapshot and its outbox entry in the checkout transaction. A signed job retries the same event to the Cloudflare Worker. D1 holds the branch-scoped invoice index and reports. Private R2 retains the invoice snapshot and caches PDFs rendered by the Worker. Cloudflare Access verifies Google identities and the Worker enforces current branch grants.

Migration 0045 follows the existing booking and push migrations. Rehearse it on isolated Neon, validate the Worker and signed Node renderer, then apply the reviewed migrations before deploying Admin.

[Invoice implementation plan](../../../design/invoicing-modernization-plan.md) · [Staging and rollout runbook](../../../apps/invoice/README.md)
