# Multi-branch support: v6 specification

Draft for implementation review · 27 October 2026 · Conditional launch: 1 January 2027

Revision v6.1 (27 October 2026) adds later user decisions and review fixes; see
[Changes in v6.1](#changes-in-v61).

This specification consolidates the v5 plan, both code reviews, and the latest
user decisions. It describes intended behavior; it does not claim the feature,
migrations, production permissions, or release gates have been implemented.

| Document | Purpose |
| --- | --- |
| [Requirements](requirements.md) | Product decisions and measurable acceptance criteria |
| [Design](design.md) | Authorization, schema invariants, synchronization and application boundaries |
| [Membership and scheduling](membership-scheduling.md) | Reserved hours, expiry, no-shows, staff conflicts and session lifecycle |
| [Tax and branch settings](tax-settings.md) | Provisional GST/SAC mapping, effective dates and immutable invoices |
| [Rollout](rollout.md) | Migration, recovery, cleanup and three release gates |
| [Implementation tasks](tasks.md) | Ordered work with verification requirements |
| [Spike results](spike-results.md) | Database prototype evidence (28 October 2026) and the driver decision |
| [Route inventory](route-inventory.md) | Every API route, page and job classified by branch policy, with the changes each needs |
| [Cross-branch settlement](settlement.md) | How branches settle membership sessions and gems used at another branch |

## Decisions incorporated in v6

- Booking rules and GST configuration are per branch; only the Developer edits
  them. Ordinary settings apply when saved to subsequent bookings and actions.
  GST versions have an explicit effective date.
- A membership session reserves minutes at confirmation, consumes them once on
  completion, and releases them on cancellation or no-show. Returned minutes
  can be reused only within the original validity period; expiry is not extended.
- Reception decides whether a customer waits or changes therapist after an
  overrun. The next session cannot start with a therapist still doing SPA work.
- Payload is the single source of truth for services, categories, prices,
  durations, gems costs, branch availability, SAC codes, website offer cards and
  checkout discounts. The Owner, Manager and Developer each edit with their own
  Payload login; there are no CMS roles at launch. Services, categories and offers
  gain version history that records the editor.
- SPA membership tiers stay in the admin portal as internal templates that
  customers never see. Receptionists and above sell memberships with hours and
  price negotiated per customer.
- Branches have a required Owner reference and an optional Manager reference.
  Cross-table role constraints are still required; a scalar user role alone does
  not enforce them. One shared Manager retains one staff identity.
- Development proceeds with provisional 5% GST for covered salon/wellness services
  and service-specific SAC mappings in [tax-settings.md](tax-settings.md).
  Membership tax treatment and launch values remain subject to launch review.

## Changes in v6.1

User decisions and review fixes added after the v6 draft. Where they conflict
with v6 text, v6.1 wins; the affected passages are edited in place.

- **Payload is the single source of truth** for services, categories, prices,
  durations, gems costs, branch availability, SAC codes, website offer cards and
  checkout discounts. Checkout discounts move from the admin Offers page into
  Payload, and that page becomes read-only. Offers created in the admin portal
  before the cutover are test data and are not migrated (R4.1, R4.8, design §5).
- **Payload access is not Developer-only.** v6's Developer-only rule came from
  the code reviews, not from a user decision. The Owner, Manager and
  Developer each keep their own Payload login on Render, with no CMS roles at
  launch. Version history records the editor. CMS roles are revisited before a
  branch with a different Owner joins.
- **SPA membership tiers stay in the admin portal** as internal starting
  templates that customers never see. Receptionists, Managers, Owners and the
  Developer sell memberships with negotiated hours and price, without approval,
  and edit tiers. The admin memberships list shows the agreed price next to the
  tier's usual price (R9, [selling a membership](membership-scheduling.md#selling-a-membership),
  MS-14 to MS-19, TX-11).
- **Managers manage Staff.** The branch's Manager, its Owner and the Developer
  add, edit and remove Stylists and Therapists; the Receptionist and Manager
  roles stay with the Owner and Developer. Add staff stays on the Staff page and
  gains a search by phone, email or name, then designation and specialization
  (R1.5, R1.11). This reverses v6's Owner/Developer-only rule.
- **Cross-branch settlement, modelled on franchise gift card and loyalty
  programmes.**
  - Memberships: the selling branch owes the performing branch each session's
    value at that membership's own rate, minus its GST share: ₹952.39 for the
    first hour of ₹10,000 for 10 hours at 5%.
  - Gems: the branch that issued the gems owes the branch where they were spent
    ₹1.00 per gem, oldest gems spent first.
  - Entries are recorded when the service is delivered, and settled through
    monthly net statements per pair of branches.
  - References: R10, [settlement.md](settlement.md),
    [membership valuation](membership-scheduling.md#cross-branch-settlement),
    MS-20 to MS-25, ST-01 to ST-08, TX-12.
- **Development applies migrations straight to the dev database.** There is no
  separate Neon branch, and work stays uncommitted until local testing at the
  end. Applied migrations are never edited; a mistake gets a new forward
  migration.
- **Developer replacement** is one transaction that demotes before it promotes
  (design §1). The runbook in `knowledge-base/authentication.md` must change.
- **Database driver decision** is now the first database task, because today's
  neon-http driver has no interactive transactions (design §4, tasks §2).
- **Web and CMS** need the same Turbopack development-cache setting as admin
  (tasks §1).
- **Neon state verified read-only:** test and pprd are archived; details in
  [rollout](rollout.md).
- **Privacy wording** now says sharing across Royal Glow branches (R3.4).
- **Defer candidates** for phase planning are listed in
  [tasks](tasks.md#launch-scope-candidates-to-defer-for-phase-planning).

No product questions are open. On 28 October 2026 the user chose settlement
without GST and approved the remaining recommended defaults: counter-only
discounts, net payments, statement access, the defer list and the agent-proposed
defaults recorded in this spec.

Still needed before launch:

- the CA review in [tax-settings](tax-settings.md), including settlement tax
  invoices;
- real legal names, GSTINs, addresses and hours for each branch;
- real Owner, Manager and staff assignments;
- revocable tokens enabled on the Ably key.
Deferred until after launch: one-day Manager branch switches and location pages.

## Scope of this artifact

This is a local specification change. Existing uncommitted application fixes
remain separate. No commit, production role change, database reset, migration,
notification or deployment is performed by writing these documents.

The archived state of the test and pprd Neon branches was checked read-only on
27 October 2026; see [rollout](rollout.md). That production bookings and invoices
are test activity is still the user's statement, and the clean-up allowlist must
prove it record by record. The rollout requires fresh checks before any operation.

The January launch depends on all three gates passing. Per-branch public location
pages, combined branch dashboards, different branch prices,
multiple receptionists, staffing-based public slots, multiple assignees in one
booking, and per-service staff skill matching stay outside the launch scope.
Membership settlement entries are recorded from launch; the statement screen may
follow by 31 January 2027.
Further candidates to defer during phase planning are listed in
[tasks](tasks.md#launch-scope-candidates-to-defer-for-phase-planning).
