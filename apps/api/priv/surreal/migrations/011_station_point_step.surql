-- 011 — nahrazení `allow_half_points` (bool) polem `point_step` (float).
--
-- `point_step` říká, po jakém kroku rozhodčí zapisuje body: 1, 0.5 nebo
-- 0.25. Default 1 = celé body. Server přijímá jen tyto tři hodnoty; DB
-- hlídá jen rozsah (0, 1>.
--
-- Migrace stávajících dat:
--   allow_half_points = true  -> point_step = 0.5
--   cokoli jiného (false/NONE) -> point_step = 1
--
-- Pořadí je důležité (ověřeno na SurrealDB v3 s daty z 001+003):
--   1. Definovat nové pole. DEFAULT platí jen pro CREATE, staré řádky
--      mají point_step = NONE (viz komentář v 010).
--   2. Staré pole přepnout na option<bool>. Kdyby zůstalo `bool`, UPDATE
--      spadne na řádku s NONE; kdyby se pole odstranilo ze schématu dřív,
--      SCHEMAFULL tabulka odmítne update záznamu, který ho ještě obsahuje
--      („Found field 'allow_half_points', but no such field exists").
--   3. Jedním UPDATE dorovnat point_step na všech řádcích.
--   4. Smazat starou hodnotu z dat a teprve potom pole ze schématu.

DEFINE FIELD IF NOT EXISTS point_step ON station TYPE float DEFAULT 1.0 ASSERT $value > 0 AND $value <= 1;

DEFINE FIELD OVERWRITE allow_half_points ON station TYPE option<bool>;

UPDATE station SET point_step = IF allow_half_points = true THEN 0.5 ELSE 1.0 END;

UPDATE station UNSET allow_half_points;

REMOVE FIELD IF EXISTS allow_half_points ON TABLE station;
