-- 007 — stav závodu "ready" + stažení hlídky ze závodu.
-- Viz docs/race-ready-state-plan.md.

-- Rozšíření stavového pole; OVERWRITE je nutné — IF NOT EXISTS by starý
-- ASSERT nechalo být a "ready" by neprošel. Existující záznamy není třeba
-- backfillovat (draft/active/closed zůstávají platné).
DEFINE FIELD OVERWRITE state ON race TYPE string
  ASSERT $value IN ["draft", "ready", "active", "closed"]
  DEFAULT "draft";
DEFINE FIELD IF NOT EXISTS prepared_at ON race TYPE option<datetime>;

-- Stažení nedostavené hlídky (náhrada za mazání v ready/active).
-- Hlídka se nemaže — už zapsané body a zpětná vazba zůstávají v DB.
DEFINE FIELD IF NOT EXISTS withdrawn ON patrol TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS withdrawn_at ON patrol TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS withdrawn_reason ON patrol TYPE option<string>;
