-- Ajout de nouveaux statuts de match : postponed, disputed, walkover
-- Pas de CHECK constraint sur matches.status en base (validation côté API).
-- Ce fichier documente les statuts valides pour référence.

-- Statuts existants :
--   pending   — match à venir
--   ongoing   — match en cours
--   finished  — match terminé (score final, propagation bracket)
--   cancelled — match annulé (pas de vainqueur)

-- Nouveaux statuts :
--   postponed — match reporté, peut revenir à pending pour re-scheduling
--   disputed  — score contesté, en attente de décision admin (bloque la propagation)
--   walkover  — victoire par forfait (a un vainqueur, déclenche la propagation)

-- Si vous souhaitez ajouter une contrainte CHECK en base :
-- ALTER TABLE matches DROP CONSTRAINT IF EXISTS check_match_status;
-- ALTER TABLE matches ADD CONSTRAINT check_match_status
--   CHECK (status IN ('pending', 'ongoing', 'finished', 'cancelled', 'postponed', 'disputed', 'walkover'));
