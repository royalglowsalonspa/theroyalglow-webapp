-- Read-only preview of migration 0005 and its preconditions for 0006.
-- JSON field extraction allows inspection before the nullable columns from
-- 0004 exist. The preview never reads customer notes or contact information.
WITH
  branch_rows AS (
    SELECT b.id, b.is_primary, b.display_order,
           to_jsonb(b)->>'owner_user_id' AS owner_id,
           to_jsonb(b)->>'manager_user_id' AS manager_id
    FROM public.branch b
  ),
  roster AS (
    SELECT id, role FROM public."user"
    WHERE role IN ('owner', 'manager', 'receptionist', 'staff', 'developer')
  ),
  inputs AS (
    SELECT (SELECT id FROM branch_rows ORDER BY is_primary DESC, display_order, id LIMIT 1) AS primary_id,
           (SELECT count(*) FROM branch_rows WHERE is_primary) AS primary_count,
           (SELECT count(*) FROM roster WHERE role = 'owner') AS owner_count,
           (SELECT min(id) FROM roster WHERE role = 'owner') AS owner_id,
           (SELECT count(*) FROM roster WHERE role = 'manager') AS manager_count,
           (SELECT min(id) FROM roster WHERE role = 'manager') AS manager_id,
           (SELECT count(*) FROM roster WHERE role = 'receptionist') AS receptionist_count,
           (SELECT count(*) FROM roster WHERE role = 'developer') AS developer_count,
           EXISTS (SELECT 1 FROM branch_rows WHERE manager_id IS NOT NULL) AS has_assigned_manager
  ),
  branch_plan AS (
    SELECT b.*,
           coalesce(b.owner_id, CASE WHEN i.owner_count = 1 THEN i.owner_id END) AS next_owner_id,
           coalesce(b.manager_id, CASE
             WHEN b.id = i.primary_id AND NOT i.has_assigned_manager AND i.manager_count = 1
             THEN i.manager_id
           END) AS next_manager_id
    FROM branch_rows b CROSS JOIN inputs i
  ),
  active_profiles AS (
    SELECT p.id, p.user_id, p.designation::text, to_jsonb(p)->>'role_witness' AS witness,
           to_jsonb(p)->>'branch_id' AS branch_id,
           CASE
             WHEN r.role = 'manager' AND p.designation = 'manager' THEN r.role
             WHEN r.role = 'receptionist' AND p.designation = 'receptionist' THEN r.role
             WHEN r.role = 'staff' AND p.designation IN ('stylist', 'therapist') THEN r.role
           END AS matching_role
    FROM public.staff_profile p LEFT JOIN roster r ON r.id = p.user_id
    WHERE p.is_active
  ),
  profile_plan AS (
    SELECT p.*,
           coalesce(p.witness, p.matching_role) AS next_witness,
           CASE
             WHEN p.witness IS NOT NULL THEN p.branch_id
             WHEN p.matching_role = 'manager' THEN NULL
             WHEN p.matching_role IS NOT NULL THEN coalesce(p.branch_id, i.primary_id)
             ELSE p.branch_id
           END AS next_branch_id
    FROM active_profiles p CROSS JOIN inputs i
  ),
  changes AS (
    SELECT 'branch_owner' AS kind, count(*) FILTER (WHERE owner_id IS NULL) AS before,
           count(*) FILTER (WHERE next_owner_id IS NULL) AS after
    FROM branch_plan
    UNION ALL
    SELECT 'primary_branch_manager',
           count(*) FILTER (WHERE b.manager_id IS NULL),
           count(*) FILTER (WHERE b.next_manager_id IS NULL)
    FROM branch_plan b JOIN inputs i ON b.id = i.primary_id
    UNION ALL
    SELECT 'active_profile_without_witness', count(*) FILTER (WHERE witness IS NULL), 0
    FROM profile_plan
    UNION ALL
    SELECT 'active_profiles', count(*), count(*) FILTER (WHERE next_witness IS NOT NULL)
    FROM profile_plan
    UNION ALL
    SELECT 'staff_schedule_unassigned', count(*) FILTER (WHERE to_jsonb(s)->>'branch_id' IS NULL), 0
    FROM public.staff_schedule s
    UNION ALL
    SELECT 'lead_unassigned', count(*) FILTER (WHERE to_jsonb(l)->>'branch_id' IS NULL), 0
    FROM public.lead l
    UNION ALL
    SELECT 'waitlist_unassigned', count(*) FILTER (WHERE to_jsonb(w)->>'branch_id' IS NULL), 0
    FROM public.waitlist w
    UNION ALL
    SELECT 'customer_note_unassigned', count(*) FILTER (WHERE to_jsonb(n)->>'branch_id' IS NULL), 0
    FROM public.customer_note n
  ),
  conflicts AS (
    SELECT 'primary_branch_unconfirmed' AS code, NULL::text AS record_id
    FROM inputs WHERE primary_count <> 1
    UNION ALL
    SELECT 'unresolved_branch_owner', id FROM branch_plan WHERE next_owner_id IS NULL
    UNION ALL
    SELECT 'manager_assignment_ambiguous', NULL
    FROM inputs WHERE manager_count > 1 AND NOT has_assigned_manager
    UNION ALL
    SELECT 'multiple_receptionists_before_backfill', NULL FROM inputs WHERE receptionist_count > 1
    UNION ALL
    SELECT 'developer_count_invalid', NULL FROM inputs WHERE developer_count <> 1
    UNION ALL
    SELECT 'missing_matching_active_profile', r.id
    FROM roster r
    WHERE r.role IN ('manager', 'receptionist', 'staff')
      AND NOT EXISTS (
        SELECT 1 FROM active_profiles p WHERE p.user_id = r.id AND p.matching_role = r.role
      )
    UNION ALL
    SELECT 'owner_has_no_branch', r.id
    FROM roster r
    WHERE r.role = 'owner' AND NOT EXISTS (SELECT 1 FROM branch_plan b WHERE b.next_owner_id = r.id)
    UNION ALL
    SELECT 'manager_has_no_branch', r.id
    FROM roster r
    WHERE r.role = 'manager' AND NOT EXISTS (SELECT 1 FROM branch_plan b WHERE b.next_manager_id = r.id)
    UNION ALL
    SELECT 'manager_has_explicit_profile_branch', id
    FROM profile_plan
    WHERE next_witness = 'manager' AND branch_id IS NOT NULL
    UNION ALL
    SELECT 'active_witness_disagrees_with_role', id
    FROM profile_plan
    WHERE next_witness IS NOT NULL AND next_witness IS DISTINCT FROM matching_role
  )
SELECT
  (SELECT primary_id FROM inputs) AS candidate_primary_branch_id,
  NOT EXISTS (SELECT 1 FROM conflicts) AS ready,
  coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY kind) FROM changes c), '[]'::jsonb) AS row_counts,
  coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY code, record_id) FROM conflicts c), '[]'::jsonb)
    AS conflicts;
