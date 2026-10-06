-- Migration : playlist YouTube « Reviews » par tournoi.
-- Date: 2026-10-06
--
-- WHY:
--   La page publique d'un tournoi gagne un onglet « Reviews » qui liste les
--   vidéos d'analyse d'une playlist YouTube. La playlist change d'une édition à
--   l'autre : c'est une propriété du TOURNOI, saisie par le staff dans l'admin
--   (URL complète ou ID, extrait et validé côté serveur).
--
-- CAVEATS:
--   - NULLABLE, sans défaut : NULL = pas de playlist = onglet masqué.
--   - Le code tolère l'absence de la colonne (lecture à part, 42703 → onglet
--     masqué ; écriture admin → 503 explicite), donc cette migration peut être
--     appliquée après le déploiement.
--   - Le CHECK reprend la validation applicative (utils/youtube/playlist.ts) :
--     la valeur finit dans une URL, rien d'autre que l'alphabet base64url.
--   - Idempotente.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS reviews_playlist_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_reviews_playlist_id_format'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_reviews_playlist_id_format
      CHECK (
        reviews_playlist_id IS NULL
        OR reviews_playlist_id ~ '^[A-Za-z0-9_-]{10,64}$'
      );
  END IF;
END $$;

COMMENT ON COLUMN public.tournaments.reviews_playlist_id IS
  'ID de la playlist YouTube affichée dans l''onglet « Reviews » de la page publique du tournoi. NULL = onglet masqué.';

NOTIFY pgrst, 'reload schema';
