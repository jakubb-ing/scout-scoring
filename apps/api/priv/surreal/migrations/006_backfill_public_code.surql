-- Backfill a public results access code for races created before the
-- feature existed. New races get a code from the app layer on create;
-- this covers the existing rows. rand::string is evaluated per row.

UPDATE race SET public_code = rand::string(8) WHERE public_code = NONE OR public_code = "";
