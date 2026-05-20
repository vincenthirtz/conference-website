-- Migration: ack des assignations cast par le caster
-- Date: 2026-05-20
--
-- Ajoute une colonne `acked_at` sur cast_assignments. Quand le bot DM le
-- caster a T-30 (cf. /api/bot/v1/cast/upcoming), le caster clique un bouton
-- "Je confirme" qui POST /api/bot/v1/cast/:assignmentId/ack et marque
-- acked_at = now(). Permet a l'admin de voir d'un coup d'oeil les ack en
-- attente vs valides, sans relire les DM Discord.
--
-- Idempotent : si la colonne existe deja (ex. ajoutee a la main avant la
-- migration) on ne re-tente pas l'ADD.

ALTER TABLE cast_assignments
  ADD COLUMN IF NOT EXISTS acked_at TIMESTAMPTZ;

COMMENT ON COLUMN cast_assignments.acked_at IS
  'Timestamp ou le caster a confirme l''assignation via le bot Discord (bouton DM).';

-- Index partiel : la requete principale est "assignments non-acked avec
-- briefing proche". On scope l'index aux unacked uniquement pour rester leger
-- et accelerer les polls /cast/upcoming.
CREATE INDEX IF NOT EXISTS idx_cast_assignments_unacked
  ON cast_assignments (briefing_at)
  WHERE acked_at IS NULL;
