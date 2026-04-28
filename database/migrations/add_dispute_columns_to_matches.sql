-- Migration: workflow de dispute par match
-- Date: 2026-04-28
--
-- Ajoute les colonnes necessaires au workflow de dispute :
-- - raison de la dispute + qui l'a ouverte + quand
-- - resolution + qui l'a tranchee + quand
--
-- Le statut 'disputed' existe deja (cf. add_match_status_values.sql) mais aucune
-- metadonnee n'etait persistee. Sans ces colonnes, on n'avait aucune trace de
-- qui a conteste quoi ni de la decision finale.
--
-- Effet metier :
--   - tant que matches.status = 'disputed', applyMatchScore et la propagation
--     bracket sont bloquees (cf. utils/matches/applyScore.ts + utils/bracket/propagate.ts)
--   - resoudre la dispute met dispute_resolution + dispute_resolved_* et fait
--     repasser le match dans son status precedent (ou un nouveau status passe par l'admin)

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_opened_by uuid,
  ADD COLUMN IF NOT EXISTS dispute_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolution text,
  ADD COLUMN IF NOT EXISTS dispute_resolved_by uuid,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz;

COMMENT ON COLUMN matches.dispute_reason IS 'Motif de la dispute saisi a l''ouverture (texte libre).';
COMMENT ON COLUMN matches.dispute_opened_by IS 'staff_members.id du staff qui a ouvert la dispute.';
COMMENT ON COLUMN matches.dispute_opened_at IS 'Timestamp d''ouverture de la dispute.';
COMMENT ON COLUMN matches.dispute_resolution IS 'Texte de la decision finale (notes admin).';
COMMENT ON COLUMN matches.dispute_resolved_by IS 'staff_members.id du staff qui a tranche la dispute.';
COMMENT ON COLUMN matches.dispute_resolved_at IS 'Timestamp de la resolution de la dispute.';

-- Index partiel : on requete souvent "tous les matches disputes en attente"
CREATE INDEX IF NOT EXISTS matches_disputed_idx
  ON matches (tournament_id, dispute_opened_at)
  WHERE status = 'disputed';
