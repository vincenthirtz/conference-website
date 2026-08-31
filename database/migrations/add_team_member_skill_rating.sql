-- Migration: add_team_member_skill_rating.sql
-- Date: 2026-08-31
--
-- WHY:
--   Une équipe qui cherche un scrim, ou le staff qui prépare un seeding, n'a
--   aujourd'hui aucun moyen de dire son niveau AVANT d'avoir joué. Le seul
--   chiffre existant, `player_ratings`, est un Glicko-2 calculé à partir des
--   matchs disputés sur le site : il ne dit rien d'une équipe qui vient
--   d'arriver, et il est délibérément hors de portée des équipes.
--
--   Ce qu'elles savent, en revanche, c'est leur SR en jeu. On leur ouvre donc
--   une colonne à elles, qu'elles renseignent et qui n'entre dans aucun calcul
--   de classement.
--
-- WHAT:
--   `team_members.skill_rating` : SR Overwatch DÉCLARÉ, 0 à 5000, nullable.
--
--   Nullable et sans valeur par défaut : ne pas déclarer son niveau est un
--   état légitime, et un `0` par défaut serait lu comme « Bronze » par
--   l'affichage — une donnée fausse plutôt qu'une donnée absente.
--
--   L'échelle 0-5000 est celle du SR classique, celle que les joueuses citent
--   (« je suis 3k5 »). Overwatch 2 affiche des divisions, mais personne
--   n'annonce sa division dans une recherche de scrim. Le découpage en paliers
--   (Bronze → Grand maître) vit côté application, dans
--   `utils/overwatchRank.ts` : c'est de l'affichage, pas une contrainte
--   d'intégrité, et le figer en SQL obligerait à migrer la base le jour où
--   Blizzard rebat les cartes.
--
-- CAVEATS:
--   - `skill_rating` ≠ `player_ratings.rating`. Le premier est déclaré par
--     l'équipe, le second calculé par le site. Aucun des deux n'alimente
--     l'autre, et ce doit rester vrai : brancher un chiffre auto-déclaré sur
--     le classement en ferait une cible à gonfler.
--   - RELOAD PostgREST OBLIGATOIRE : une colonne ajoutée reste invisible du
--     cache de schéma tant qu'il n'a pas été rechargé (le NOTIFY est joué en
--     fin de migration). Sans ça, tout `select('… , skill_rating')` renvoie
--     une erreur de colonne inconnue.
--   - Idempotente : ADD COLUMN IF NOT EXISTS + contrainte posée seulement si
--     absente.
--   - Rollback :
--       ALTER TABLE public.team_members DROP COLUMN IF EXISTS skill_rating;

BEGIN;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS skill_rating integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.team_members'::regclass
      AND conname = 'team_members_skill_rating_range'
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_skill_rating_range
      CHECK (skill_rating IS NULL OR (skill_rating >= 0 AND skill_rating <= 5000));
  END IF;
END $$;

COMMENT ON COLUMN public.team_members.skill_rating IS
  'SR Overwatch declare par l''equipe (0-5000, NULL = non declare). Sans lien avec player_ratings, qui est calcule par le site.';

COMMIT;

NOTIFY pgrst, 'reload schema';
