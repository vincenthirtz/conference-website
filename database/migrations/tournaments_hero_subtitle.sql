-- Migration : sous-titre du hero par tournoi.
-- Date: 2026-10-07
--
-- WHY:
--   Le hero de la page publique d'un tournoi affichait une accroche unique,
--   en dur (« Cinq maps, une arène, une seule couronne… ») : juste pour la
--   saison régulière, fausse pour un événement ponctuel comme Halloween.
--   L'accroche devient une propriété du TOURNOI, saisie dans l'admin.
--
-- CAVEATS:
--   - NULLABLE, sans défaut : NULL = accroche par défaut (i18n FR/EN).
--   - Texte libre, mono-langue : une accroche saisie s'affiche telle quelle
--     dans les deux langues du site.
--   - Idempotente.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS hero_subtitle text;

COMMENT ON COLUMN public.tournaments.hero_subtitle IS
  'Accroche affichée sous le nom du tournoi dans le hero de sa page publique. NULL = accroche par défaut.';

NOTIFY pgrst, 'reload schema';
