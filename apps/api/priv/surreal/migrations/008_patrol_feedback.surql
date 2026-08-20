-- 008 — slovní zpětná vazba od doprovodu hlídky.
-- Viz docs/patrol-feedback-plan.md.

-- Nastavení na závodě
DEFINE FIELD IF NOT EXISTS feedback_enabled ON race TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS feedback_positive_count ON race TYPE int
  ASSERT $value >= 0 AND $value <= 10 DEFAULT 3;
DEFINE FIELD IF NOT EXISTS feedback_negative_count ON race TYPE int
  ASSERT $value >= 0 AND $value <= 10 DEFAULT 3;
DEFINE FIELD IF NOT EXISTS feedback_public ON race TYPE bool DEFAULT false;

-- Auth na hlídce — stejný vzor jako stanoviště (PIN + nonce pro invalidaci
-- vydaných tokenů při resetu).
DEFINE FIELD IF NOT EXISTS feedback_pin ON patrol TYPE option<string>;
DEFINE FIELD IF NOT EXISTS feedback_nonce ON patrol TYPE option<string>;

-- Jeden záznam na hlídku (UNIQUE) — autosave je upsert, idempotentní.
DEFINE TABLE IF NOT EXISTS patrol_feedback SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS patrol ON patrol_feedback TYPE record<patrol>;
DEFINE FIELD IF NOT EXISTS race ON patrol_feedback TYPE record<race>;
-- positives/negatives: pole stringů, index = pořadí textarey
DEFINE FIELD IF NOT EXISTS positives ON patrol_feedback TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS negatives ON patrol_feedback TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS state ON patrol_feedback TYPE string
  ASSERT $value IN ["draft", "submitted"] DEFAULT "draft";
DEFINE FIELD IF NOT EXISTS submitted_at ON patrol_feedback TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS reopened_at ON patrol_feedback TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS reopened_by ON patrol_feedback TYPE option<string>;
DEFINE FIELD IF NOT EXISTS reopen_count ON patrol_feedback TYPE int DEFAULT 0;
-- lock: bez TTL, čistí se převzetím nebo submitem
DEFINE FIELD IF NOT EXISTS lock_device ON patrol_feedback TYPE option<string>;
DEFINE FIELD IF NOT EXISTS lock_at ON patrol_feedback TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS created_at ON patrol_feedback TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON patrol_feedback TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS feedback_patrol_unique ON patrol_feedback FIELDS patrol UNIQUE;
DEFINE INDEX IF NOT EXISTS feedback_race ON patrol_feedback FIELDS race;
