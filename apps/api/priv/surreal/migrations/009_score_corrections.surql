-- 009 — dodatečné opravy bodů adminem po uzavření závodu.
-- Viz docs/score-correction-plan.md.

-- Stopa opravy přímo na záznamu — výsledky umí ukázat odznak "upraveno"
-- (jen čas; kdo a proč zůstává v audit logu pro organizátory).
DEFINE FIELD IF NOT EXISTS corrected_at ON score_entry TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS corrected_by ON score_entry TYPE option<string>;
DEFINE FIELD IF NOT EXISTS correction_reason ON score_entry TYPE option<string>;

-- Výpis historie změn řadí podle (race, at).
DEFINE INDEX IF NOT EXISTS audit_race_at ON audit_log FIELDS race, at;
