-- Run after both ledgers reach the release candidate, using a read-only connection.
-- psql -X -v ON_ERROR_STOP=1 -v launch_date=YYYY-MM-DD -f preview-multi-branch-launch.sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- These counts must be zero before making the corresponding columns mandatory.
SELECT 'lead.branch_id' AS field, count(*) AS missing FROM public.lead WHERE branch_id IS NULL
UNION ALL
SELECT 'waitlist.branch_id', count(*) FROM public.waitlist WHERE branch_id IS NULL
UNION ALL
SELECT 'customer_note.branch_id', count(*) FROM public.customer_note WHERE branch_id IS NULL
UNION ALL
SELECT 'spa_membership.selling_branch_id', count(*) FROM public.spa_membership
WHERE selling_branch_id IS NULL;

-- Report coverage without exporting issuer identifiers or staff contact details.
SELECT b.id AS branch_id, b.status, b.manager_user_id IS NOT NULL AS has_manager,
       nullif(btrim(b.legal_name), '') IS NOT NULL AS has_legal_name,
       b.gstin IS NOT NULL AS has_gstin, b.invoice_prefix,
       (SELECT max(revision) FROM public.branch_setting AS s WHERE s.branch_id = b.id)
         AS settings_revision
FROM public.branch AS b
WHERE b.status <> 'shutdown'
ORDER BY b.id;

-- Find active catalogue lines whose launch-day rate is missing or provisional.
-- The newest applicable version takes precedence even if it is provisional.
WITH launch AS (
  SELECT :'launch_date'::date::timestamp AT TIME ZONE 'Asia/Kolkata' AS tax_point
), branch_lines AS (
  SELECT b.id AS branch_id, 'service' AS kind, s.id AS line_id,
         coalesce(s.sac_code, c.sac_code) AS sac_code
  FROM public.branch AS b
  CROSS JOIN public.service AS s
  JOIN public.service_category AS c ON c.id = s.category_id
  WHERE b.status <> 'shutdown' AND s.is_active AND c.is_active
    AND public.service_available_at(s.id, b.id)
  UNION ALL
  SELECT b.id, 'membership_tier', t.id, t.sac_code
  FROM public.branch AS b
  CROSS JOIN public.spa_membership_tier AS t
  WHERE b.status <> 'shutdown' AND t.is_active
)
SELECT l.branch_id, l.kind, l.line_id, l.sac_code,
       CASE WHEN l.sac_code IS NULL THEN 'missing_sac'
            WHEN r.id IS NULL THEN 'missing_rate'
            ELSE 'provisional_rate' END AS gap
FROM branch_lines AS l
CROSS JOIN launch
LEFT JOIN LATERAL (
  SELECT v.id, v.review_status
  FROM public.branch_tax_version AS v
  WHERE v.branch_id = l.branch_id AND v.sac_code = l.sac_code
    AND v.effective_from <= launch.tax_point
  ORDER BY v.effective_from DESC
  LIMIT 1
) AS r ON true
WHERE r.review_status IS DISTINCT FROM 'reviewed'
ORDER BY l.branch_id, l.kind, l.line_id;

ROLLBACK;
