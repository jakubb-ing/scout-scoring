-- Public results sharing: an optional access code stored on the race.
-- When set (non-empty), anyone who enters it can view the read-only
-- results page without an organizer account. Empty / NONE = disabled.

DEFINE FIELD IF NOT EXISTS public_code ON race TYPE option<string>;
