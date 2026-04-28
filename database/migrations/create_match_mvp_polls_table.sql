-- Migration: MVP polls per match
-- Date: 2026-04-28
--
-- Stocke l'etat du sondage MVP envoye sur Discord apres chaque match termine,
-- ainsi que la joueuse gagnante quand l'admin l'aura saisie manuellement
-- (les polls Discord natifs ne sont pas re-importables sans un vrai bot).

CREATE TABLE IF NOT EXISTS match_mvp_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  posted_at timestamptz,
  duration_hours integer NOT NULL DEFAULT 24,
  candidate_player_ids uuid[] NOT NULL DEFAULT '{}',
  winner_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  winner_battle_tag text,
  winner_imported_at timestamptz,
  winner_imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_mvp_polls_match_idx ON match_mvp_polls (match_id);

COMMENT ON TABLE match_mvp_polls IS 'Etat du sondage MVP Discord pour chaque match termine.';
COMMENT ON COLUMN match_mvp_polls.candidate_player_ids IS 'IDs des team_members proposes comme candidats au moment ou le poll a ete poste.';
COMMENT ON COLUMN match_mvp_polls.winner_member_id IS 'Joueuse selectionnee comme MVP par l''admin (manual import).';
COMMENT ON COLUMN match_mvp_polls.winner_battle_tag IS 'Snapshot du battle_tag au moment de l''import (au cas ou le membre est supprime).';
