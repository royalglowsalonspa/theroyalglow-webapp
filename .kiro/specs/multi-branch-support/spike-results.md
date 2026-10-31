# Database spike results (28 October 2026)

Evidence for tasks §1 (membership balance) and §2 (database invariants). Run on
a temporary Neon branch copied from dev, `tmp-mb-spike-2026-10-27`
(`br-noisy-smoke-aouevchf`): PostgreSQL 18.6, btree_gist 1.8. Some older
documents say PostgreSQL 16; the database is 18.

Method: SQL through the Neon API. Prototype tables live in a `spike` schema.
Each case ran in its own transaction that was rolled back afterwards, with
deferred checks forced to run before the rollback. One extra case committed for
real to confirm that the deferred Developer check fires at `COMMIT`.

## 1. Membership session balance guard (tasks §1)

The fix in `recordMembershipSession` runs the deduction inside the batch as a
guarded `UPDATE`. When the guard matches no row, `1 / count(*)` aborts the
whole batch. Tested on the copied application tables with the exact statement
order of the new batch:

| Case | Result |
| --- | --- |
| 60 minutes left, session of 60 | Recorded; 0 left |
| Second session of 60, different key | `division by zero`; booking, lines, invoice and items all rolled back |
| Same key again | `booking_redemption_key_uidx` violation before the guard runs, so a retry is a replay |
| Membership expired one second earlier | `division by zero`; nothing written |
| Unexpired again, 240 total, session of 30 | Recorded; 150 left |

Final state: 90 minutes used, exactly the two expected bookings.

Not exercised: two transactions actually waiting on each other. The Neon API
ran the "parallel" calls one after the other, and dblink needs a password the
API does not expose. PostgreSQL's documented read-committed behavior makes the
second `UPDATE` wait for the first, then re-check its `WHERE` against the
committed row. A two-connection Vitest integration test must still prove it
once the shell works.

Production had no memberships on 28 October, so the bug has not corrupted live
balances.

## 2. Role relationships (design §1)

Pattern that passed:

```sql
-- One current role per user; (id, role) is the target of role-qualified FKs.
ALTER TABLE "user" ADD CONSTRAINT user_id_role_key UNIQUE (id, role);
CREATE UNIQUE INDEX user_one_developer ON "user" ((true)) WHERE role = 'developer';

-- branch: owner_role is always 'owner', manager_role always 'manager'.
FOREIGN KEY (owner_user_id, owner_role) REFERENCES "user" (id, role)
  ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE
FOREIGN KEY (manager_user_id, manager_role) REFERENCES "user" (id, role) ...same

-- staff_profile: role_witness is NULL when inactive; the designation must
-- match the role; Staff and Receptionists need a branch, Managers have none.
FOREIGN KEY (user_id, role_witness) REFERENCES "user" (id, role) ...same
CREATE UNIQUE INDEX staff_one_receptionist_per_branch ON staff_profile (branch_id)
  WHERE role_witness = 'receptionist';

-- Deferred constraint triggers (plpgsql): exactly one Developer; an Owner owns
-- at least one branch; a Manager manages one and has an active profile; a
-- Receptionist or Staff member has an active profile.
```

26 cases, all as designed:

- **Rejected:**
  - an Owner as Manager anywhere, including their own branch;
  - a Customer as Owner;
  - demoting an Owner who still owns a branch;
  - an Owner role with no branch;
  - deleting an Owner's only branch;
  - a second Developer;
  - demoting or deleting the only Developer, also in a real committed transaction;
  - promoting the new Developer before demoting the old one;
  - a Manager left managing nothing;
  - a second profile for a shared Manager;
  - a second Receptionist at a branch;
  - a Receptionist with no branch, or with the role but no profile;
  - an Owner with a performing profile;
  - Staff titled Receptionist;
  - demoting an active Stylist without closing the profile.
- **Accepted:**
  - Owner handover in the order promote, move, demote;
  - handover demoting first, when the Owner FK is deferred in that transaction;
  - Developer swap demoting first;
  - removing a Manager properly;
  - a Receptionist at another branch;
  - removing a Stylist properly;
  - adding a Therapist.

Consequences:

- The Developer runbook must demote before it promotes, in one transaction.
  The partial unique index is checked per statement.
- A role-change transaction either orders its writes promote, move, demote, or
  runs `SET CONSTRAINTS <fk> DEFERRED` first.
- Open risk, write skew: the deferred guards use `EXISTS` and `count(*)`, so two
  concurrent transactions could each remove one of a shared Manager's two
  branches and both commit. Mitigation: the guard function first locks the
  user's row with `SELECT … FOR NO KEY UPDATE`. That serializes concurrent
  guards for the same person without blocking foreign-key checks. Role changes
  also lock rows in ID order (design §1); a deadlock aborts one transaction
  with 40P01, which the caller retries. With the lock added, the 26 cases gave
  the same results. The two-connection test still has to prove the race.

## 3. Staff occupancy (membership-scheduling, MS-07 and MS-08)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- kind is 'spa' or 'hair'; during is a half-open [start, end) range.
CONSTRAINT spa_no_overlap      EXCLUDE USING gist (person_id WITH =, during WITH &&) WHERE (kind = 'spa')
CONSTRAINT spa_hair_no_overlap EXCLUDE USING gist (person_id WITH =, during WITH &&, kind WITH <>)
```

The same two constraints on a separate actual-work table, where a running
session has no end (`tstzrange(started_at, NULL)`), block a new start.

13 cases, all as designed:

- **Rejected:**
  - SPA over SPA for the same person at another branch;
  - hair over SPA;
  - SPA over hair;
  - a closed `[]` interval;
  - starting a SPA or hair session while that person's SPA is still running;
  - moving an existing SPA onto another.
- **Accepted:**
  - hair over hair;
  - back-to-back SPA, before and after;
  - the same slot for another person;
  - finishing the running SPA, then starting the next;
  - two overlapping hair starts.

Exclusion constraints wait on conflicting uncommitted rows, so they are not
exposed to the write skew above. The concurrent case still belongs in the
integration test.

## 4. Membership minute holds (membership-scheduling, MS-01 to MS-06)

The prototype has a `membership` table with purchased, consumed and reserved
minutes, and `CHECK (consumed + reserved <= purchased)`. A `minute_hold` table
has one row per booking, with state held, consumed or released. Hold, consume
and release are single guarded statements (data-modifying CTEs), so they work
on today's driver.

9 cases, all as designed:

- a second hold beyond the balance is refused;
- the same booking cannot hold twice;
- consume and release each act once, and retries do nothing;
- a released no-show's minutes can be reused before expiry;
- release after completion does nothing;
- a direct SQL overcommit is rejected by the CHECK;
- a hold starting exactly at the stored expiry instant is accepted;
- a hold starting 1 ms after expiry is refused;
- a validly started session can be consumed after the membership expires.

## 5. Driver decision (design §4)

Decision, confirmed by the user on 28 October: keep `drizzle-orm/neon-http` for
launch. Use single guarded
statements, and HTTP batches whose guards raise an error, as in sections 1 and
4. Database invariants come from sections 2 and 3, so they hold whatever the
driver.

Reasons:

- It is proven above and already used by gems redemption, booking completion
  and role assignment.
- It needs no new dependency, and no WebSocket pool lifecycle on Lambda.
- Postgres serializes the races in the database itself (row locks, unique
  indexes, exclusion constraints).

Revisit the Neon WebSocket `Pool` only for a flow that must read, decide in
application code, then write inside one transaction. None is planned.

## 6. Migration implications

- **Hand-written SQL is required.** Drizzle 0.45's `foreignKey()` has only
  `onUpdate`/`onDelete`, with no DEFERRABLE, and pg-core has no
  exclusion-constraint or trigger builder. The deferrable foreign keys,
  exclusion constraints, `btree_gist`, guard functions and constraint triggers
  therefore need custom migrations (`drizzle-kit generate --custom`). Those
  migrations still go generate, review, commit, migrate.
- **The drift gate misses these objects.**
  `packages/db/scripts/drift/catalog-queries.ts` reads foreign keys, but not
  their deferrability. It reads no exclusion constraints and no triggers.
  Extend it, or add a schema-invariant test, so these objects cannot silently
  go missing.
- **Backfill inputs, read-only counts on 28 October:**
  - dev has one user per role, with active profiles for its Manager,
    Receptionist and Stylist.
  - Production has 1 Owner (royalglowsalonspa@gmail.com), 1 Manager with an
    active profile and 12 Customers. On 28 October, at the user's request,
    katbose.dev@gmail.com became its Developer; dev already had the same Owner
    and Developer. The test and pprd user tables are empty.
  - The Manager needs `branch.manager_user_id` on at least one branch before
    the Manager guard is enabled.

## Follow-ups

- [ ] Two-connection integration tests (Vitest) for the session guard, minute
  holds, occupancy and role changes, including the write-skew case. *29/10:
  role changes done on dev with prefixed rows
  (`packages/db/src/queries/branch-roles.integration.test.ts`): the
  shared-Manager write skew lets one of two concurrent removals commit, and a
  change waits on another transaction's user-row lock. The session guard,
  minute holds and occupancy remain.*
- [x] Add the user-row lock to the role guard function and re-run section 2.
- [ ] Extend drift fingerprinting to deferrability, exclusion constraints and
  triggers.
- [x] Delete the temporary branch `br-noisy-smoke-aouevchf` (deleted 28 October).
