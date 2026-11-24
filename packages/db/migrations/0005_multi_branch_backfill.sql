-- Multi-branch backfill (tasks §3, step 2). Hand-written and reviewed
-- (29 October 2026); generated with `drizzle-kit generate --custom`, so the
-- snapshot is unchanged.
--
-- Fills the role relationships added by 0004 from today's single-branch data:
--   * the one Owner owns every branch that has no Owner;
--   * the one Manager manages the primary branch;
--   * every active staff profile records the role it grants (role_witness).
--     Staff and the Receptionist work at the primary branch; a Manager's
--     branches come from the branch rows, so their profile has none;
--   * an active profile that grants no role (an Owner's, a Customer's) is
--     closed and kept as history;
--   * staff schedules, leads, waitlist entries and customer notes belong to
--     the primary branch. Notes stay branch-private (R3.1).
--
-- Idempotent: every write fills only what is still empty, so running it again
-- changes nothing. One statement, so it applies in full or not at all. It
-- refuses, writing nothing, when the data is ambiguous (two Owners for an
-- unowned branch, two Managers for none, two Receptionists, two Developers)
-- or a role has no profile with a matching title, and it checks afterwards
-- that every Owner owns a branch and every Manager manages one. A person
-- settles those cases by hand first.
--
-- A database with branches but no Owner account (an emptied test branch)
-- keeps owner_user_id empty here; 0006 then refuses it, as intended. Reset
-- such a branch from production instead (migration-discipline.md).
DO $$
DECLARE
  primary_branch text;
  problem text;
BEGIN
  SELECT id INTO primary_branch
  FROM branch
  ORDER BY is_primary DESC, display_order, id
  LIMIT 1;
  IF primary_branch IS NULL THEN
    RETURN;
  END IF;

  -- 1. Refuse ambiguous data before writing anything.
  SELECT string_agg(reason, '; ') INTO problem
  FROM (
    SELECT 'more than one Owner, and a branch without one' AS reason
    WHERE (SELECT count(*) FROM "user" WHERE role = 'owner') > 1
      AND EXISTS (SELECT 1 FROM branch WHERE owner_user_id IS NULL)
    UNION ALL
    SELECT 'more than one Manager, and none managing a branch'
    WHERE (SELECT count(*) FROM "user" WHERE role = 'manager') > 1
      AND NOT EXISTS (SELECT 1 FROM branch WHERE manager_user_id IS NOT NULL)
    UNION ALL
    SELECT 'more than one Receptionist'
    WHERE (SELECT count(*) FROM "user" WHERE role = 'receptionist') > 1
    UNION ALL
    SELECT 'more than one Developer'
    WHERE (SELECT count(*) FROM "user" WHERE role = 'developer') > 1
    UNION ALL
    SELECT format('%s %s has no active profile with a matching title', u.role, u.id)
    FROM "user" u
    WHERE u.role IN ('manager', 'receptionist', 'staff')
      AND NOT EXISTS (
        SELECT 1
        FROM staff_profile p
        WHERE p.user_id = u.id
          AND p.is_active
          AND p.designation::text = ANY (
            CASE u.role
              WHEN 'manager' THEN ARRAY['manager']
              WHEN 'receptionist' THEN ARRAY['receptionist']
              ELSE ARRAY['stylist', 'therapist']
            END
          )
      )
  ) problems;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'multi-branch backfill refused: %', problem;
  END IF;

  -- 2. The one Owner owns every branch without an Owner.
  UPDATE branch
  SET owner_user_id = (SELECT id FROM "user" WHERE role = 'owner' ORDER BY id LIMIT 1),
      updated_at = now()
  WHERE owner_user_id IS NULL
    AND EXISTS (SELECT 1 FROM "user" WHERE role = 'owner');

  -- 3. The one Manager manages the primary branch, unless a Manager is set.
  UPDATE branch
  SET manager_user_id = (SELECT id FROM "user" WHERE role = 'manager' ORDER BY id LIMIT 1),
      updated_at = now()
  WHERE id = primary_branch
    AND manager_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM branch WHERE manager_user_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM "user" WHERE role = 'manager');

  -- 4. Every active profile that matches its person's role records that role.
  UPDATE staff_profile p
  SET role_witness = u.role,
      branch_id = CASE WHEN u.role = 'manager' THEN NULL ELSE coalesce(p.branch_id, primary_branch) END,
      updated_at = now()
  FROM "user" u
  WHERE u.id = p.user_id
    AND p.is_active
    AND p.role_witness IS NULL
    AND (
      (u.role = 'manager' AND p.designation = 'manager')
      OR (u.role = 'receptionist' AND p.designation = 'receptionist')
      OR (u.role = 'staff' AND p.designation IN ('stylist', 'therapist'))
    );

  -- 5. An active profile that grants no role is closed, kept as history.
  UPDATE staff_profile
  SET is_active = false,
      updated_at = now()
  WHERE is_active
    AND role_witness IS NULL;

  -- 6. Existing branch-owned rows belong to the primary branch.
  UPDATE staff_schedule SET branch_id = primary_branch WHERE branch_id IS NULL;
  UPDATE lead SET branch_id = primary_branch WHERE branch_id IS NULL;
  UPDATE waitlist SET branch_id = primary_branch WHERE branch_id IS NULL;
  UPDATE customer_note SET branch_id = primary_branch WHERE branch_id IS NULL;

  -- 7. Every Owner owns a branch and every Manager manages one.
  SELECT string_agg(reason, '; ') INTO problem
  FROM (
    SELECT format('Owner %s owns no branch', u.id) AS reason
    FROM "user" u
    WHERE u.role = 'owner'
      AND NOT EXISTS (SELECT 1 FROM branch b WHERE b.owner_user_id = u.id)
    UNION ALL
    SELECT format('Manager %s manages no branch', u.id)
    FROM "user" u
    WHERE u.role = 'manager'
      AND NOT EXISTS (SELECT 1 FROM branch b WHERE b.manager_user_id = u.id)
  ) problems;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'multi-branch backfill refused: %', problem;
  END IF;
END
$$;
