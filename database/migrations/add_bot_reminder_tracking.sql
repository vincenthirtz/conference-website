-- Migration: Bot reminder tracking columns + cast_assignments table
-- Date: 2026-05-12
--
-- Permet au bot Discord (qui poll /api/bot/reminders) de DM les bons users
-- une seule fois pour chacun des 3 rappels:
--   - match_checkin   T-30 (par equipe, pour le DM individuel au capitaine)
--   - tournament_j1   J-1 (par tournoi)
--   - cast_briefing   T-X (par assignment)
--
-- Note: matches.reminder_30_sent_at existe deja mais sert au ping canal
-- Discord avec role mention (pas du DM individuel). On ajoute des colonnes
-- dediees pour le DM capitaine afin de ne pas marcher sur ce systeme.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS team1_captain_dm_30_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS team2_captain_dm_30_sent_at timestamptz;

COMMENT ON COLUMN matches.team1_captain_dm_30_sent_at IS
  'Timestamp du DM Discord T-30 envoye au capitaine de team1.';
COMMENT ON COLUMN matches.team2_captain_dm_30_sent_at IS
  'Timestamp du DM Discord T-30 envoye au capitaine de team2.';

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS j1_reminder_sent_at timestamptz;

COMMENT ON COLUMN tournaments.j1_reminder_sent_at IS
  'Timestamp du DM J-1 envoye aux capitaines (rappel inscription).';

-- cast_assignments: qui caste quel match et a quelle heure de briefing.
-- L'UI admin pour creer ces assignments est un sujet a part; ici on pose
-- juste le schema et l'index.
CREATE TABLE IF NOT EXISTS cast_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  cast_member_id uuid NOT NULL REFERENCES cast_members(id) ON DELETE CASCADE,
  briefing_at timestamptz NOT NULL,
  briefing_reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, cast_member_id)
);

CREATE INDEX IF NOT EXISTS cast_assignments_match_idx
  ON cast_assignments (match_id);
CREATE INDEX IF NOT EXISTS cast_assignments_cast_member_idx
  ON cast_assignments (cast_member_id);
CREATE INDEX IF NOT EXISTS cast_assignments_briefing_at_idx
  ON cast_assignments (briefing_at);

COMMENT ON TABLE cast_assignments IS
  'Assignement d''un caster (cast_members) a un match avec heure de briefing.';
COMMENT ON COLUMN cast_assignments.briefing_reminder_sent_at IS
  'Timestamp du DM Discord de rappel de briefing envoye au caster.';
