-- Eigene Fassung neben dem Original (25.07.2026)
--
-- Nur nötig, wenn `schema.sql` schon vor dem 25.07. ausgeführt wurde.
-- Wer das Schema jetzt erst einspielt, hat die Spalte bereits drin.
--
-- Ohne diese Spalte scheitert der Rezept-Push mit
-- „Could not find the 'variant' column of 'recipes'".

alter table public.recipes
  add column if not exists variant jsonb;
