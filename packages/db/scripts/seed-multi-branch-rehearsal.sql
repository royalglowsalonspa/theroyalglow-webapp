-- Run with psql -X against a freshly migrated, disposable local PostgreSQL database.
-- The fixture models a shared Owner across A and B, with C owned separately.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public, pg_temp;

DO $$
BEGIN
  IF current_database() !~ '^rgss_rehearsal_[a-z0-9_]+$'
     OR NOT (inet_server_addr() IS NULL OR inet_server_addr() IN ('127.0.0.1', '::1')) THEN
    RAISE EXCEPTION 'Use a disposable loopback database named rgss_rehearsal_<name>';
  END IF;
  PERFORM pg_advisory_xact_lock(312, 1);
  IF EXISTS (SELECT 1 FROM branch WHERE id NOT IN ('rehearsal_mb_a', 'rehearsal_mb_b', 'rehearsal_mb_c'))
     OR EXISTS (SELECT 1 FROM system_setting WHERE key = 'invoicing' AND value->'live' IS DISTINCT FROM 'false'::jsonb) THEN
    RAISE EXCEPTION 'Rehearsal seed requires a fresh branch catalogue and test invoicing';
  END IF;
END
$$;

CREATE TEMP TABLE rehearsal_branches (
  code text PRIMARY KEY,
  number integer NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  pincode text NOT NULL,
  phone text NOT NULL,
  gstin text NOT NULL,
  weekday_open text NOT NULL,
  weekday_close text NOT NULL,
  weekend_close text NOT NULL,
  closed_day text,
  lead_minutes integer NOT NULL,
  rate_bps integer NOT NULL,
  therapist text NOT NULL,
  stylist text NOT NULL,
  receptionist text NOT NULL,
  manager text NOT NULL,
  lead_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO rehearsal_branches VALUES
  ('a', 901, 'Rayasandra Studio', 'Unit 4, Example Arcade, Rayasandra', '560100', '+91 00000 00001',
   '29ZZZZZ0001Z1Z0', '10:00', '20:00', '21:00', NULL, 60, 500,
   'Ananya Rao', 'Ravi Hegde', 'Nisha Menon', 'Meera Kulkarni', 'Kavya Shetty'),
  ('b', 902, 'Marathahalli Studio', 'Suite 2, Example Plaza, Marathahalli', '560037', '+91 00000 00002',
   '29ZZZZZ0002Z1Z0', '11:00', '20:00', '21:00', 'mon', 90, 1800,
   'Sana Iyer', 'Arjun Pai', 'Divya Nair', 'Rohan Bhat', 'Priya Narayan'),
  ('c', 903, 'Whitefield Studio', 'Unit 6, Example Court, Whitefield', '560066', '+91 00000 00003',
   '29ZZZZZ0003Z1Z0', '10:00', '19:00', '20:00', 'wed', 120, 500,
   'Isha Das', 'Kiran Prasad', 'Tara Sethi', 'Neel Sharma', 'Aditi Joshi');

INSERT INTO "user" (id, name, email, role)
SELECT 'rehearsal_mb_' || person.id, person.name || ' (Rehearsal)',
       person.id || '@example.invalid', person.role
FROM (
  VALUES ('owner_ab', 'Asha Bhat', 'owner'), ('owner_c', 'Dev Malhotra', 'owner'),
         ('customer', 'Simran Rao', 'customer')
) AS person(id, name, role)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "user" (id, name, email, role)
SELECT 'rehearsal_mb_developer', 'Sanjay Kapoor (Rehearsal)', 'developer@example.invalid', 'developer'
WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE role = 'developer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "user" (id, name, email, role)
SELECT 'rehearsal_mb_' || b.code || '_' || p.title, p.name || ' (Rehearsal)',
       b.code || '.' || p.title || '@example.invalid', p.role
FROM rehearsal_branches b
CROSS JOIN LATERAL (VALUES
  ('manager', b.manager, 'manager'), ('receptionist', b.receptionist, 'receptionist'),
  ('stylist', b.stylist, 'staff'), ('therapist', b.therapist, 'staff')
) AS p(title, name, role)
ON CONFLICT (id) DO NOTHING;

INSERT INTO branch (id, number, code, name, address_line1, pincode, phone, email,
                    is_primary, display_order, legal_name, gstin, invoice_prefix,
                    owner_user_id, manager_user_id)
SELECT 'rehearsal_mb_' || b.code, b.number, 'Z' || upper(b.code), b.name || ' (Rehearsal)',
       b.address, b.pincode, b.phone, 'studio.' || b.code || '@example.invalid',
       b.code = 'a', b.number, 'Rehearsal Example Salon and Spa LLP', b.gstin, 'Z' || upper(b.code),
       CASE WHEN b.code = 'c' THEN 'rehearsal_mb_owner_c' ELSE 'rehearsal_mb_owner_ab' END,
       'rehearsal_mb_' || b.code || '_manager'
FROM rehearsal_branches b
ON CONFLICT (id) DO NOTHING;

INSERT INTO branch_setting (id, branch_id, revision, business_hours, booking_rules, changed_section)
SELECT 'rehearsal_mb_' || b.code || '_settings', current.branch_id, 2,
       (SELECT jsonb_object_agg(day, jsonb_build_object(
         'open', CASE WHEN day IN ('sat', 'sun') THEN '10:00' ELSE b.weekday_open END,
         'close', CASE WHEN day IN ('sat', 'sun') THEN b.weekend_close ELSE b.weekday_close END,
         'closed', day IS NOT DISTINCT FROM b.closed_day
       )) FROM unnest(ARRAY['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) AS day),
       current.booking_rules || jsonb_build_object('minAdvanceLeadTimeMinutes', b.lead_minutes), NULL
FROM rehearsal_branches b
JOIN branch_setting current ON current.branch_id = 'rehearsal_mb_' || b.code AND current.revision = 1
WHERE NOT EXISTS (SELECT 1 FROM branch_setting s WHERE s.branch_id = current.branch_id AND s.revision = 2);

-- The 18% case is a fixture for different branch totals. All rates remain provisional.
INSERT INTO branch_tax_version (id, branch_id, sac_code, rate_bps, prices_include_tax,
                                effective_from, review_status, reason)
SELECT 'rehearsal_mb_tax_' || b.code || '_' || sac.code, 'rehearsal_mb_' || b.code, sac.code,
       b.rate_bps, true, TIMESTAMPTZ '2025-09-22 00:00:00+05:30', 'provisional',
       'Synthetic tax comparison for the isolated multi-branch rehearsal'
FROM rehearsal_branches b
CROSS JOIN (VALUES ('999721'), ('999722'), ('999723'), ('999729')) AS sac(code)
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_setting (id, key, value, description)
VALUES ('rehearsal_mb_invoicing', 'invoicing', '{"live":false}', 'Synthetic rehearsal invoices')
ON CONFLICT (key) DO NOTHING;

INSERT INTO staff_profile (id, user_id, designation, specialization, branch_id, role_witness)
SELECT 'rehearsal_mb_staff_' || b.code || '_' || p.title,
       'rehearsal_mb_' || b.code || '_' || p.title, p.title::staff_designation, p.specialty,
       CASE WHEN p.title = 'manager' THEN NULL ELSE 'rehearsal_mb_' || b.code END, p.role
FROM rehearsal_branches b
CROSS JOIN (VALUES
  ('manager', 'manager', 'Studio operations'), ('receptionist', 'receptionist', 'Guest services'),
  ('stylist', 'staff', 'Haircut and styling'), ('therapist', 'staff', 'SPA massage and wellness')
) AS p(title, role, specialty)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_schedule (id, staff_id, day_of_week, start_time, end_time, is_working, branch_id)
SELECT 'rehearsal_mb_shift_' || b.code || '_' || s.designation || '_' || day.ordinal,
       s.id, day.ordinal::integer - 1,
       (settings.business_hours->day.name->>'open')::time,
       (settings.business_hours->day.name->>'close')::time,
       true, 'rehearsal_mb_' || b.code
FROM rehearsal_branches b
JOIN staff_profile s ON s.user_id IN ('rehearsal_mb_' || b.code || '_stylist',
                                     'rehearsal_mb_' || b.code || '_therapist')
JOIN branch_setting settings ON settings.branch_id = s.branch_id AND settings.revision = 2
CROSS JOIN unnest(ARRAY['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) WITH ORDINALITY AS day(name, ordinal)
WHERE NOT (settings.business_hours->day.name->>'closed')::boolean
ON CONFLICT (id) DO NOTHING;

-- Payload owns catalogue writes. Map only services already available at each fixture branch.
INSERT INTO staff_service (staff_id, service_id)
SELECT staff.id, s.id
FROM rehearsal_branches b
JOIN staff_profile staff ON staff.user_id IN ('rehearsal_mb_' || b.code || '_stylist',
                                             'rehearsal_mb_' || b.code || '_therapist')
JOIN service_category c ON c.service_type =
  CASE WHEN staff.designation = 'therapist' THEN 'spa'::service_type ELSE 'salon'::service_type END
JOIN service s ON s.category_id = c.id
WHERE c.is_active AND s.is_active AND service_available_at(s.id, staff.branch_id)
ON CONFLICT (staff_id, service_id) DO NOTHING;

INSERT INTO holiday (id, branch_id, date, name)
VALUES ('rehearsal_mb_b_closure', 'rehearsal_mb_b',
        to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 month 13 days', 'YYYY-MM-DD'),
        'Equipment servicing (Rehearsal)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO customer_profile (id, user_id, appointment_reminders_enabled, membership_alerts_enabled)
VALUES ('rehearsal_mb_customer_profile', 'rehearsal_mb_customer', false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO lead (id, name, phone, email, branch_id, source)
SELECT 'rehearsal_mb_' || b.code || '_lead', b.lead_name || ' (Rehearsal)', b.phone,
       'lead.' || b.code || '@example.invalid', 'rehearsal_mb_' || b.code, 'rehearsal'
FROM rehearsal_branches b
ON CONFLICT (id) DO NOTHING;

INSERT INTO spa_membership_tier (id, name, slug, description, default_hours_minutes,
                                 default_price_paise, default_validity_days, sac_code)
VALUES ('rehearsal_mb_tier_restore', 'Restore 8 (Rehearsal)', 'rehearsal-restore-8',
        'Eight hours of SPA treatments over 90 days', 480, 960000, 90, '999723')
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT b.id, b.code, b.owner_user_id, b.manager_user_id,
       (SELECT count(*) FROM staff_service ss JOIN staff_profile sp ON sp.id = ss.staff_id
          WHERE sp.branch_id = b.id) AS staff_service_assignments
FROM branch b
WHERE b.id IN ('rehearsal_mb_a', 'rehearsal_mb_b', 'rehearsal_mb_c')
ORDER BY b.number;
