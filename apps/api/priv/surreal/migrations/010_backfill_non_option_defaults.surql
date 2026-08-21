-- 010 — dorovnání polí přidaných v 007 a 008 na existujících záznamech.
--
-- `DEFAULT` se v SurrealDB uplatní jen při zakládání záznamu. Pole
-- s neoptionálním typem (bool, int) tak zůstala na starých řádcích jako
-- NONE a SCHEMAFULL tabulka pak odmítla *jakýkoli* další update:
--   Couldn't coerce value for field `feedback_negative_count`:
--   Expected `int` but found `NONE`
-- Prakticky to znamenalo, že u závodů a hlídek založených před migrací
-- nešlo uložit ani změnu názvu — API vracelo 404.
--
-- Dorovnat je musí jeden příkaz na tabulku: kdyby se pole nastavovala
-- postupně, každý dílčí update by spadl na tom dosud nedorovnaném.

UPDATE race SET
  feedback_enabled = feedback_enabled ?? false,
  feedback_positive_count = feedback_positive_count ?? 3,
  feedback_negative_count = feedback_negative_count ?? 3,
  feedback_public = feedback_public ?? false;

UPDATE patrol SET
  withdrawn = withdrawn ?? false;
