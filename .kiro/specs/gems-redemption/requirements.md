# Requirements Document

## Introduction

This feature adds **online gems redemption** to the Royal Glow Salon & Spa (RGSS) customer website (`apps/web`). Gems **earning** is already implemented (booking completion awards 1 gem per ₹100 on `service` invoices) and is explicitly out of scope here — this spec covers **redemption only**.

Redemption happens exclusively through the dedicated gems catalogue at the customer route `/gems`, never at normal booking checkout. The model for this is the McDonald's India points programme: gems are redeemable only against a curated set menu of services, not applied as a discount on every purchase.

Only a curated set of services participate: services flagged `gemsRedeemable = true` with a defined `gemsRequired` gem price. Redemption is **all-or-nothing** — a redeemable service is fully covered by gems with no money/gems split. A customer may redeem a service costing N gems if and only if their current balance is greater than or equal to N.

This phase is **customer-only**: a logged-in customer redeems against their own account. A receptionist/admin-initiated redemption path is deferred to a future phase. The existing `/gems` page already renders the balance and a read-only catalogue ("ask our team at the counter; no online redemption"); this feature replaces that read-only state with a working online redemption action.

The current data model is reused as-is (no new tables required for the core flow): `loyalty_account` (`gemsBalance`, `totalGemsEarned`, `totalGemsRedeemed`, unique `customerId`), `loyalty_transaction` (`type` enum `earned|redeemed|expired|adjusted`, `gemsAmount`, nullable `invoiceId`, `description`, `expiresAt`, `createdAt`), and `service` (`gemsRedeemable`, nullable `gemsRequired`, `gemsCatalogueOrder`, `pricePaise`).

> **Note on open considerations:** Several execution-time questions (the durable output form of a redemption, whether a date/slot is chosen at redemption time, the exact idempotency mechanism) are deliberately left **unresolved** in this document and captured as explicit "open consideration" requirements to be settled in the design phase.

## Glossary

- **Gems**: Integer loyalty points earned by customers. Whole units only; never fractional.
- **Customer**: An authenticated end user with their own session, acting on their own loyalty account. The lowest RBAC role.
- **Loyalty_Account**: The `loyalty_account` row tied uniquely to a customer, holding `gemsBalance`, `totalGemsEarned`, and `totalGemsRedeemed`.
- **Gems_Balance**: The integer `gemsBalance` field of a Loyalty_Account — the customer's currently spendable gems.
- **Redeemable_Service**: An active `service` row (`isActive = true`) with `gemsRedeemable = true` and a non-null `gemsRequired` value.
- **Gems_Required**: The integer `gemsRequired` price (in gems) of a Redeemable_Service.
- **Gems_Catalogue**: The customer-facing list at `/gems` of Redeemable_Services, each shown with its Gems_Required price and an affordability indicator.
- **Affordability_Indicator**: A per-service flag derived as `Gems_Balance >= Gems_Required` that tells the customer whether a given Redeemable_Service is currently redeemable.
- **Redemption_System**: The component (API route + business logic + data-access queries) that validates and executes a redemption on `apps/web`.
- **Redemption**: The all-or-nothing act of spending exactly Gems_Required gems to fully cover one Redeemable_Service.
- **Redemption_Record**: The durable persisted result of a successful Redemption that ties together the customer, the service, and the gems spent (its exact form — booking vs voucher — is an open consideration).
- **Redemption_Reference**: A human-readable confirmation identifier surfaced to the customer after a successful Redemption.
- **Loyalty_Transaction**: A `loyalty_transaction` row. A Redemption records one with `type = 'redeemed'`.
- **Insufficient_Balance**: The condition where Gems_Balance is less than the Gems_Required of the service being redeemed.

## Requirements

### Requirement 1: View the gems catalogue (customer-only)

**User Story:** As a logged-in customer, I want to view the catalogue of gems-redeemable services with my balance, so that I can see what I can redeem.

#### Acceptance Criteria

1. WHEN a Customer with a valid session requests the Gems_Catalogue, THE Redemption_System SHALL return the Customer's current Gems_Balance and the list of Redeemable_Services.
2. THE Redemption_System SHALL include in the Gems_Catalogue only services where `gemsRedeemable = true` AND `isActive = true` AND `gemsRequired` is non-null.
3. IF a service has `gemsRedeemable = true` AND `gemsRequired` is null, THEN THE Redemption_System SHALL exclude that service from the Gems_Catalogue.
4. THE Redemption_System SHALL include each Redeemable_Service's name, Gems_Required value, and money worth (`pricePaise`) in the Gems_Catalogue.
5. THE Redemption_System SHALL order the Gems_Catalogue by `gemsCatalogueOrder` ascending with null ordering values placed last.
6. IF an unauthenticated request is made to view the Gems_Catalogue through the redemption API, THEN THE Redemption_System SHALL respond with HTTP status 401.

### Requirement 2: Affordability indicator

**User Story:** As a logged-in customer, I want each service to show whether I can afford it, so that I know which services I can redeem right now.

#### Acceptance Criteria

1. WHERE a Redeemable_Service has Gems_Required less than or equal to the Customer's Gems_Balance, THE Redemption_System SHALL mark that service's Affordability_Indicator as affordable.
2. WHERE a Redeemable_Service has Gems_Required greater than the Customer's Gems_Balance, THE Redemption_System SHALL mark that service's Affordability_Indicator as not affordable.
3. THE Redemption_System SHALL compute each Affordability_Indicator using the all-or-nothing rule, treating a service as affordable only when the full Gems_Required is covered.

### Requirement 3: All-or-nothing redemption eligibility

**User Story:** As a customer, I want to redeem a service fully with gems, so that the service is completely covered without paying money.

#### Acceptance Criteria

1. WHEN a Customer submits a Redemption for a Redeemable_Service AND the Customer's Gems_Balance is greater than or equal to that service's Gems_Required, THE Redemption_System SHALL execute the Redemption.
2. IF a Customer submits a Redemption for a Redeemable_Service AND the Customer's Gems_Balance is less than that service's Gems_Required, THEN THE Redemption_System SHALL reject the Redemption with an Insufficient_Balance error and SHALL leave the Gems_Balance unchanged.
3. THE Redemption_System SHALL spend exactly the Gems_Required amount for a Redemption, with no partial money/gems split.
4. IF a Customer submits a Redemption for a service that is not a Redeemable_Service, THEN THE Redemption_System SHALL reject the Redemption and SHALL leave the Gems_Balance unchanged.
5. IF a Customer submits a Redemption for a service whose `gemsRequired` is null, THEN THE Redemption_System SHALL reject the Redemption and SHALL leave the Gems_Balance unchanged.
6. IF a Customer submits a Redemption for a service that is not active (`isActive = false`), THEN THE Redemption_System SHALL reject the Redemption and SHALL leave the Gems_Balance unchanged.

### Requirement 4: Atomic balance deduction and transaction record

**User Story:** As a customer, I want a redemption to update my balance, history, and totals together, so that my account stays consistent.

#### Acceptance Criteria

1. WHEN the Redemption_System executes a Redemption, THE Redemption_System SHALL deduct exactly the Gems_Required amount from the Customer's Gems_Balance.
2. WHEN the Redemption_System executes a Redemption, THE Redemption_System SHALL record one Loyalty_Transaction with `type = 'redeemed'` representing the Gems_Required gems spent.
3. WHEN the Redemption_System executes a Redemption, THE Redemption_System SHALL increase the Customer's `totalGemsRedeemed` by exactly the Gems_Required amount.
4. THE Redemption_System SHALL perform the Gems_Balance deduction, the `redeemed` Loyalty_Transaction insertion, the `totalGemsRedeemed` increment, and the Redemption_Record creation as a single atomic unit, such that either all of these persist or none of them persist.
5. WHEN the Redemption_System records a `redeemed` Loyalty_Transaction, THE Redemption_System SHALL store the redeemed gems quantity consistently with the existing transaction-amount convention used by the gems history display.

### Requirement 5: Concurrency and double-spend protection

**User Story:** As the business, I want redemptions to be safe under concurrent or repeated submissions, so that customers cannot spend gems they do not have.

#### Acceptance Criteria

1. WHEN the Redemption_System executes a Redemption, THE Redemption_System SHALL re-read the Customer's Gems_Balance inside the atomic write and SHALL confirm the balance is greater than or equal to Gems_Required before deducting.
2. IF the re-checked Gems_Balance inside the atomic write is less than Gems_Required, THEN THE Redemption_System SHALL abort the Redemption with an Insufficient_Balance error and SHALL leave the Gems_Balance unchanged.
3. WHEN two Redemptions for the same Customer are submitted concurrently AND the combined Gems_Required exceeds the Gems_Balance, THE Redemption_System SHALL allow at most the set of Redemptions whose cumulative cost does not exceed the Gems_Balance and SHALL reject the remainder with an Insufficient_Balance error.
4. THE Redemption_System SHALL ensure that across all accepted Redemptions for a Customer, the sum of deducted gems never exceeds the gems available to that Customer.

### Requirement 6: Idempotency / double-submit protection

**User Story:** As a customer, I want an accidental double-click or retried request not to charge me twice, so that I keep the gems I did not intend to spend.

#### Acceptance Criteria

1. WHEN the Redemption_System receives a duplicate submission of a Redemption that has already succeeded, THE Redemption_System SHALL NOT deduct gems more than once for that single intended Redemption.
2. THE Redemption_System SHALL provide a mechanism to distinguish a retried duplicate submission from a distinct new Redemption request. *(Open consideration: the exact mechanism — e.g. client-supplied idempotency key, server-generated request token, or a uniqueness constraint on the Redemption_Record — is to be decided in design.)*

### Requirement 7: Execution-time re-validation against stale catalogue

**User Story:** As the business, I want redemption to validate live data at execution time, so that a stale catalogue cannot cause over-spending or wrong pricing.

#### Acceptance Criteria

1. WHEN the Redemption_System executes a Redemption, THE Redemption_System SHALL re-read the target service's current `gemsRequired`, `gemsRedeemable`, and `isActive` values at execution time rather than trusting values supplied by the client.
2. IF the target service is no longer a Redeemable_Service at execution time, THEN THE Redemption_System SHALL reject the Redemption and SHALL leave the Gems_Balance unchanged.
3. WHEN the Redemption_System executes a Redemption, THE Redemption_System SHALL charge the Gems_Required value read at execution time, even if a client-submitted value differs.

### Requirement 8: Customer self-scoping

**User Story:** As a customer, I want redemptions to affect only my own account, so that no one can spend or alter another customer's gems.

#### Acceptance Criteria

1. THE Redemption_System SHALL resolve the target Loyalty_Account from the authenticated session rather than from client-supplied account or customer identifiers.
2. WHEN a Customer executes a Redemption, THE Redemption_System SHALL modify only the Loyalty_Account belonging to that authenticated Customer.
3. IF a Redemption request is made without a valid customer session, THEN THE Redemption_System SHALL respond with HTTP status 401 and SHALL NOT modify any Loyalty_Account.

### Requirement 9: Durable redemption record and confirmation

**User Story:** As a customer, I want proof of what I redeemed, so that I can claim the service at the salon.

#### Acceptance Criteria

1. WHEN the Redemption_System completes a Redemption, THE Redemption_System SHALL create a Redemption_Record that ties together the Customer, the redeemed service, and the gems spent.
2. WHEN the Redemption_System completes a Redemption, THE Redemption_System SHALL surface a Redemption_Reference confirmation to the Customer.
3. THE Redemption_System SHALL persist the Redemption_Record durably so that the Redemption is verifiable after the confirmation is dismissed.
4. **(Open consideration)** THE Redemption_Record output form SHALL be decided in design as one of: (a) a ₹0 booking that the Customer schedules a date/slot for, marked so it never earns gems and never combines with offers; or (b) a redemption voucher/record the Customer presents at the salon counter. This document does not resolve this choice.
5. **(Open consideration)** WHETHER a date/slot is selected at Redemption time or fulfilled later SHALL be decided in design and is not resolved in this document.

### Requirement 10: No gems earned and no offer stacking on redeemed services

**User Story:** As the business, I want gems-redeemed services to not generate more gems or combine with money offers, so that the loyalty programme is not exploitable.

#### Acceptance Criteria

1. WHEN a Redemption produces a Redemption_Record, THE Redemption_System SHALL mark that record so that it earns zero gems.
2. THE Redemption_System SHALL prevent a gems-redeemed Redemption_Record from being combined with any monetary offer.
3. IF a Redemption_Record is later fulfilled or completed, THEN THE Redemption_System SHALL award zero gems for that fulfilment.

### Requirement 11: Error and edge-case handling

**User Story:** As a customer, I want clear errors when a redemption cannot proceed, so that I understand what happened and my balance is protected.

#### Acceptance Criteria

1. IF a Redemption fails for Insufficient_Balance, THEN THE Redemption_System SHALL return an error that distinguishes Insufficient_Balance from other failure causes and SHALL leave the Gems_Balance unchanged.
2. IF a Redemption references a service that does not exist, THEN THE Redemption_System SHALL reject the Redemption with a not-found error and SHALL leave the Gems_Balance unchanged.
3. IF the Customer has no Loyalty_Account when a Redemption is attempted, THEN THE Redemption_System SHALL treat the Gems_Balance as zero and SHALL reject any Redemption with a non-zero Gems_Required as Insufficient_Balance.
4. THE Redemption_System SHALL return all responses using the standard success/error response envelope used across the `apps/web` API.

## Out of Scope (Deferred / Future Phases)

- **Receptionist/admin-initiated redemption.** Redeeming gems on behalf of a customer from the admin portal (`apps/admin`) is deferred to a future phase. This phase is customer-only, self-service on `apps/web`.
- **Gems earning.** Earning logic (1 gem per ₹100 on `service` invoices at booking completion) is already implemented and unchanged.
- **Gems-expiry interplay.** Interaction between redemption ordering and the 365-day expiry / expiry cron (e.g. spending oldest-expiring gems first) is not specified here and is deferred. Redemption deducts from the single integer Gems_Balance.
- **Money/gems split redemption.** Partial coverage (pay some money + some gems) is explicitly excluded; redemption is all-or-nothing.
- **Redemption at normal booking checkout.** Gems are never applied as a discount in the standard booking flow.

## Open Considerations (to resolve in Design)

1. **Redemption output form** — ₹0 booking (customer schedules date/slot) vs. counter-presented voucher/record (Requirement 9.4).
2. **Date/slot timing** — chosen at redemption time vs. fulfilled later (Requirement 9.5).
3. **Idempotency mechanism** — idempotency key vs. request token vs. uniqueness constraint (Requirement 6.2).
4. **Atomic write strategy** — the existing earning path uses `db.batch()` (neon-http has no interactive transactions); design must confirm `db.batch()` can both re-check balance and conditionally abort, or choose a conditional-update guard (e.g. `UPDATE ... WHERE gems_balance >= gemsRequired` and inspect affected rows) to enforce Requirement 5.
