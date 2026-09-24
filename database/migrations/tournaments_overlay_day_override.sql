-- Migration : forcer le jour affiché par la source OBS « Matchs du jour ».
-- Date: 2026-09-24
--
-- WHY. La source `/overlay/day?tournament=…` affiche AUJOURD'HUI (heure de
--   Paris). Un jour sans match, elle est vide : impossible de régler la scène
--   OBS avant la soirée. L'aperçu daté de l'onglet Outils ouvrait un onglet,
--   mais la source déjà collée dans OBS, elle, ne suivait pas. L'admin peut
--   désormais ENVOYER un jour à la source, sans changer son URL.
--
-- EXPIRATION. `overlay_day_set_at` date le forçage ; l'API ne l'honore que
--   pendant 12 h. Un test oublié la veille ne s'affiche pas en direct le
--   lendemain.
--
-- CAVEATS:
--   - Additive et idempotente ; colonnes nullables, NULL = comportement
--     d'avant (le jour même).
--   - Une `date=` explicite dans l'URL de la source prime toujours.
--   - Rollback : DROP COLUMN sur les deux colonnes.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS overlay_day_date date,
  ADD COLUMN IF NOT EXISTS overlay_day_set_at timestamptz;

COMMENT ON COLUMN public.tournaments.overlay_day_date IS
  'Jour forcé pour la source OBS « Matchs du jour » (NULL = aujourd''hui, Paris).';
COMMENT ON COLUMN public.tournaments.overlay_day_set_at IS
  'Pose du forçage ; honoré 12 h (cf. utils/overlay/dayOverride.ts).';
