# Cross-branch settlement: memberships and gems (v6.1)

Status: implementation specification, 28 October 2026. Read with
[requirements](requirements.md) R10, [membership and scheduling](membership-scheduling.md)
(how a membership session is valued) and [tasks](tasks.md) §4c.

A customer can use SPA membership hours and spend gems at any branch. The branch
that took the money or issued the gems is often not the branch that delivers the
service, so branches owe each other money. This document defines how that is
recorded and settled.

## How franchise networks handle this

- **Gift cards and other prepaid value.** The selling location keeps the money
  until the value is used. Nothing moves when the value is used where it was
  sold. When it is used elsewhere, the selling location funds that redemption
  ([eCard Systems](https://support.ecardsystems.com/en/articles/14667219-cross-location-gift-card-reconciliation)).
- **Settlement cycles.** Wendy's franchisees settle gift cards between
  themselves daily through Givex
  ([Givex](https://www-prc2.givex.com/about-us/case-studies/wendys.html)). Other
  programmes compare each location's sales and redemptions monthly and debit or
  credit the difference
  ([eCard Systems](https://support.ecardsystems.com/en/articles/14667529-corporate-gift-card-reconciliation)).
- **Salon and spa franchise software.** MyTime creates a reconciliation record
  each time a ticket closes. It values the item at its price times an
  adjustment rate: the share that moves to the location that delivered the
  service
  ([MyTime](https://get.mytime.com/resource-center/blog/how-to-manage-gift-cards-packages-and-membership-redemptions-across-franchise-locations/)).
  Zenoti tracks where loyalty points were earned separately from where they
  were spent, and settles the balance between owners on a regular cycle
  ([Zenoti](https://www.zenoti.com/blog/cross-location-loyalty-settlement-salon-spa-franchise)).
- **Larger networks** usually move the money through a central pool that the
  franchisor runs
  ([Revscale](https://revscale.com/blog/franchise-gift-card-liability-reconciliation)).
- McDonald's does not publish how it settles points between franchisees, so it
  is not used as a source here.

## Decisions

User decisions on 28 October 2026. The user also approved the remaining
recommended defaults in bulk.

1. An entry is recorded when the service is delivered, as the ticket closes,
   never reconstructed at month-end.
2. Memberships: a session is valued at that membership's own rate. The
   performing branch is owed the value minus its GST share, so settlement is
   without GST: ₹952.39 for the first hour of a ₹10,000, 10-hour membership at
   5%.
3. Gems: the branch where the gems were earned pays the branch where they were
   spent, at a fixed value per gem.
4. The performing branch receives 100% of the amount. This is the adjustment
   rate other systems use: a single setting that only the Developer changes,
   stored on every entry.
5. Monthly statements per pair of branches; only the net difference is paid.
6. Growth path: once three or more branches have different Owners, each branch
   settles one net amount per month through the franchisor's account, as
   larger networks do. The entries already support this, so only the statement
   view and payment step change.

## Gems settlement

- **Batches.** Every earned gems transaction is a batch: the branch of the
  invoice that earned it, the number of gems and the expiry date (365 days).
- **Spending order.** A redemption takes gems from the batches that expire
  first. Customers lose fewer gems to expiry, and every gem spent traces back
  to the branch that issued it. The allocation to batches is recorded in the
  same statement that deducts the balance, so two redemptions can never spend
  the same batch twice.
- **Value per gem.** ₹1.00 by default, because customers earn 1 gem per ₹100
  spent, a 1% reward. Only the Developer changes it, and each entry stores the
  value it used. Catalogue guidance: set a service's gems cost to its price in
  rupees, so a gem stays worth about ₹1. No service is gems-redeemable yet on
  dev or prod (checked 28 October).
- **When recorded.** When the free service is completed: a gems redemption
  booking reaching completed, or gems spent at checkout. For gems from a batch
  earned at another branch, the earning branch owes the redeeming branch
  gems × value per gem × share. Gems earned at the same branch create an
  internal entry.
- **If the free service doesn't happen.** When a redemption booking is
  rejected, cancelled or a no-show before it starts, its gems return to the same
  batches. Gems from batches that expired in the meantime expire straight away.
  This mirrors the membership rule for released minutes. No settlement entry
  is recorded.
- **Expiry.** The nightly job expires only each batch's unspent gems. The
  earning branch keeps the value of expired gems; no money moves.
- **GST.** No GST is added to the value per gem. Whether a branch must invoice
  another for it is part of the CA review in [tax-settings](tax-settings.md).

Existing defects this design fixes, found on 28 October:

- `jobGemsAutoExpire` in `packages/db/src/queries/jobs.ts` deducts a batch's
  full amount at expiry even when the customer already spent those gems. That
  drives the balance negative, and `loyalty_account.gems_balance` has no check
  against it. No one is affected yet: production has six earned batches and no
  redemptions.
- Nothing returns gems when a gems redemption booking is rejected or
  cancelled, so the customer loses them.

## Statements

Memberships and gems use the same ledger and statements.

- An entry belongs to the IST calendar month in which it is recorded.
- A daily job closes every ended month that isn't closed yet, so a missed run
  catches up and a retry changes nothing.
- Closing creates one statement per pair of branches with entries that month.
  It shows what each owes the other, split into memberships and gems, plus the
  net amount and direction. The close also records each branch's net position
  across all its counterparts, for the growth path.
- A closed statement never changes. Entries recorded later, including
  corrections, go into the next open month. A correction is a reversing entry,
  never an edit.
- Money moves outside the system, by bank transfer or UPI. The paying branch's
  Owner or the Developer marks a statement paid, with the date and a payment
  reference. The change is audited.
- When one Owner owns both branches, statements are still produced so each
  branch's figures are right, and the payment can be marked as an internal
  transfer.
- Only the Owners of the two branches and the Developer can see a statement and
  its entries. This is a deliberate exception to R3.2: the performing branch's
  Owner can work out the selling branch's rate for a membership. Managers and
  Receptionists at the performing branch see hours and gems only.
- Statements and entries download as CSV for the accountant.

Each branch's monthly report shows membership sales collected, membership value
delivered to its own customers, and gems issued and redeemed. It also shows
amounts to receive and to pay for both memberships and gems.

## Acceptance criteria

- **ST-01:** 500 gems from a batch earned at RS, spent on a free service
  completed at MH, record ₹500.00 owed by RS to MH at ₹1.00 per gem and 100%
  share. Gems earned at MH and spent there record an internal entry only.
- **ST-02:** a redemption covering batches from both branches takes the
  earliest-expiring gems first, and records one entry per earning branch.
- **ST-03:** a rejected, cancelled or missed redemption returns its gems to the
  same batches before they expire, records no entry, and never returns gems
  from a batch that has expired.
- **ST-04:** expiry removes only unspent gems; a customer who spent a whole
  batch before it expired keeps a correct, non-negative balance.
- **ST-05:** changing the value per gem or the share affects only later
  entries; earlier entries keep the values they used.
- **ST-06:** two concurrent redemptions never allocate the same batch's gems
  twice.
- **ST-07:** a statement totals memberships and gems in both directions for a
  pair of branches and shows the net. Closing a month twice changes nothing.
  MS-24 and MS-25 apply to gems entries too.
- **ST-08:** each month, the branches' net positions across all pairs add up to
  zero.
