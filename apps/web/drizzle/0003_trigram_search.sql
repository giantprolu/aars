-- Recherche textuelle par similarité trigramme (AD-6).
--
-- Un ILIKE '%terme%' balaierait les 3200 lignes CIQUAL à chaque frappe et
-- rendrait tout index inutile. La similarité trigramme tolère en plus les
-- fautes de frappe, ce qu'un LIKE ne fait pas.

CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint

-- `unaccent` est déclarée STABLE et non IMMUTABLE, parce qu'elle résout son
-- dictionnaire au moment de l'appel. Un index d'expression exige IMMUTABLE.
-- Nommer le dictionnaire explicitement lève l'ambiguïté et rend l'enveloppe
-- honnêtement immuable.
CREATE OR REPLACE FUNCTION nutri_normalize(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, value))
$$;--> statement-breakpoint

-- L'expression indexée est exactement celle qu'emploient les requêtes de
-- recherche. Toute divergence, même un lower() en trop, écarterait l'index.
CREATE INDEX IF NOT EXISTS ciqual_foods_name_trgm_idx
  ON ciqual_foods
  USING gin (nutri_normalize(name) gin_trgm_ops);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products
  USING gin (nutri_normalize(name) gin_trgm_ops);--> statement-breakpoint

-- Les aliments incomplets sont exclus de la recherche (FR-6) : cet index
-- partiel évite de les parcourir.
CREATE INDEX IF NOT EXISTS ciqual_foods_complete_idx
  ON ciqual_foods (is_complete)
  WHERE is_complete;
