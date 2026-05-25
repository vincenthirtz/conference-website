-- Migration: cast_assignments polymorphique match | scrim (Lot 9)
--
-- WHY:
--   Aujourd'hui un cast_assignment ne référence QUE des `matches`
--   (FK NOT NULL `match_id`). Les scrims (table flat — un scrim = un match
--   complet : team1_id/team2_id/scheduled_date/stream_url) n'ont aucun
--   mécanisme pour assigner des casters, ce qui force le staff à dupliquer
--   le workflow ailleurs ou à NE PAS caster les scrims publics — pertes
--   produit.
--
--   Approche polymorphe : `match_id` devient NULLABLE et on ajoute
--   `scrim_id` NULLABLE (FK scrims). CHECK exclusive : exactement UN des
--   deux doit être NOT NULL. Le code applicatif (utils/cast/...) lit la
--   colonne renseignée et résout l'entité associée (match ou scrim).
--
--   Avantages :
--     - Une seule table d'assignment → reuse complet du briefing/ack/cron
--       de rappel.
--     - Pas de migration de données : tous les rows existants ont
--       match_id NOT NULL et scrim_id NULL → CHECK vert dès l'application.
--
-- DEPLOY NOTES:
--   - Idempotent (IF NOT EXISTS + DROP CONSTRAINT IF EXISTS).
--   - PostgREST schema cache reload requis (nouvelle FK + drop NOT NULL).
--   - Un index sur scrim_id pour les lookups symétriques à match_id.

ALTER TABLE public.cast_assignments
  ALTER COLUMN match_id DROP NOT NULL;

ALTER TABLE public.cast_assignments
  ADD COLUMN IF NOT EXISTS scrim_id uuid;

ALTER TABLE public.cast_assignments
  DROP CONSTRAINT IF EXISTS fk_cast_assignments_scrim;
ALTER TABLE public.cast_assignments
  ADD CONSTRAINT fk_cast_assignments_scrim
  FOREIGN KEY (scrim_id) REFERENCES public.scrims(id) ON DELETE CASCADE;

ALTER TABLE public.cast_assignments
  DROP CONSTRAINT IF EXISTS chk_cast_assignments_entity_xor;
ALTER TABLE public.cast_assignments
  ADD CONSTRAINT chk_cast_assignments_entity_xor
  CHECK (
    (match_id IS NOT NULL AND scrim_id IS NULL)
    OR (match_id IS NULL AND scrim_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_cast_assignments_scrim_id
  ON public.cast_assignments (scrim_id)
  WHERE scrim_id IS NOT NULL;

COMMENT ON COLUMN public.cast_assignments.match_id IS
  'Lot 9 : NULLABLE. Exclusive avec scrim_id (CHECK chk_cast_assignments_entity_xor).';
COMMENT ON COLUMN public.cast_assignments.scrim_id IS
  'Lot 9 : Cast assignment pour un scrim (au lieu d''un match). Exactement UN des deux (match_id, scrim_id) est NOT NULL.';

-- ===========================================================================
-- scrims.discord_thread_id — mirror le pattern matches pour réutiliser
-- les threads Discord (match-thread.js bot).
-- ===========================================================================

ALTER TABLE public.scrims
  ADD COLUMN IF NOT EXISTS discord_thread_id text;

COMMENT ON COLUMN public.scrims.discord_thread_id IS
  'Lot 9 : thread Discord du scrim (parité avec matches.discord_thread_id). Posé par le bot quand un cast assignment est créé.';

-- Reminder operator :
--   NOTIFY pgrst, 'reload schema';
