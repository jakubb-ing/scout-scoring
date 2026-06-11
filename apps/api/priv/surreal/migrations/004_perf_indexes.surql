-- Performance indexes for filtered lookups that previously did full scans.
--
-- patrol.category — delete_category checks `SELECT id FROM patrol WHERE
--   category = $category LIMIT 1` before allowing a category to be removed.
-- organizer.is_admin — ensure_not_last_admin runs a count over admins on
--   every admin grant/revoke and organizer deletion.
DEFINE INDEX IF NOT EXISTS patrol_category ON patrol FIELDS category;
DEFINE INDEX IF NOT EXISTS organizer_is_admin ON organizer FIELDS is_admin;
