# Invoice rollout requirements

- Keep invoice issuance, numbering and payments atomic in Admin. A retry must preserve the saved invoice and payment allocations.
- Allow only assigned Google accounts into the invoice portal. Limit owner, manager and read-only accountant access by branch.
- Expire cached PDFs after 180 days and retain the original invoice records for regeneration and reviewed resend.
- Rehearse migration, ingest, rendering, reporting and access with synthetic data before enabling production publishing and email.

[Invoice implementation plan](../../../design/invoicing-modernization-plan.md)
