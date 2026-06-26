-- ARCHIVÉ le 2026-06-26 : SEED de configuration one-shot (UPSERT d'une ligne
--   site_settings 'homepage_event_date' avec une date d'événement spécifique). C'est
--   de la DONNÉE de prod réglée à la main, pas du schéma -> non versionné en migration.
--   À ré-appliquer manuellement si la date d'événement change. Conservé pour historique.
-- =====================================================================

-- Set homepage_event_date used by the home countdown.
-- Stores an ISO 8601 timestamp with timezone offset so that JS Date parses
-- it consistently (no UTC fallback). For Paris in summer (CEST) use +02:00,
-- in winter (CET) use +01:00.
--
-- Usage:
--   psql ... -f database/set_homepage_event_date.sql
--   (or paste in the Supabase SQL editor)

INSERT INTO site_settings (key, value, description)
VALUES (
  'homepage_event_date',
  '2026-09-18T19:00:00+02:00',
  'Date ISO du prochain événement affiché en compte à rebours sur la page d''accueil. Si vide, la date de début du prochain tournoi est utilisée. Format : 2026-06-15T18:00:00+02:00'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = COALESCE(site_settings.description, EXCLUDED.description),
      updated_at = NOW();
