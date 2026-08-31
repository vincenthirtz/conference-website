-- Migration: add_team_declared_skill_rating.sql
-- Date: 2026-08-31
--
-- WHY:
--   Le niveau d'équipe se calcule aujourd'hui en moyennant le SR de chaque
--   joueuse (`team_members.skill_rating`). Ça suppose que l'équipe accepte de
--   renseigner huit fiches pour publier un chiffre — et beaucoup ne le feront
--   pas : le SR individuel est une donnée personnelle, une remplaçante peut ne
--   pas vouloir l'exposer, et une capitaine qui veut juste annoncer « on est
--   plutôt 3k2 » n'a aucun moyen de le dire.
--
--   Résultat : une équipe qui ne veut pas détailler n'apparaît nulle part dans
--   l'annuaire des adversaires, faute de niveau exploitable.
--
-- WHAT:
--   `teams.skill_rating` : SR d'ensemble DÉCLARÉ par la capitaine ou une
--   manager, 0 à 5000, nullable. Il ne remplace pas les fiches individuelles,
--   il les COURT-CIRCUITE à l'affichage :
--
--     déclaré non nul  →  c'est lui qui fait foi ;
--     sinon            →  moyenne des fiches jouantes renseignées ;
--     sinon            →  rien.
--
--   La règle vit dans `utils/overwatchRank.ts` (`resolveTeamSkillRating`), en
--   un seul endroit, parce que trois écrans la lisent.
--
-- CAVEATS:
--   - Le déclaré PRIME sur la moyenne, y compris quand les deux existent. C'est
--     volontaire : une équipe qui a pris la peine d'annoncer un chiffre
--     d'ensemble sait mieux que nous ce qu'elle vaut, et voir son annonce
--     écrasée par une moyenne calculée sur trois fiches sur huit serait
--     incompréhensible. L'affichage dit toujours laquelle des deux sources il
--     montre.
--   - Même colonne que `team_members.skill_rating`, même bornes, même échelle
--     (SR 0-5000). Rien à voir avec `team_ratings.rating`, qui est le Glicko
--     calculé à partir des matchs — celui-là, personne ne le saisit.
--   - RELOAD PostgREST OBLIGATOIRE : une colonne ajoutée reste invisible du
--     cache de schéma tant qu'il n'a pas été rechargé.
--   - Idempotente : ADD COLUMN IF NOT EXISTS + contrainte posée si absente.
--   - Rollback :
--       ALTER TABLE public.teams DROP COLUMN IF EXISTS skill_rating;

BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS skill_rating integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.teams'::regclass
      AND conname = 'teams_skill_rating_range'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_skill_rating_range
      CHECK (skill_rating IS NULL OR (skill_rating >= 0 AND skill_rating <= 5000));
  END IF;
END $$;

COMMENT ON COLUMN public.teams.skill_rating IS
  'SR Overwatch d''ensemble declare par la capitaine ou une manager (0-5000, NULL = non declare). Prime sur la moyenne des fiches individuelles a l''affichage.';

COMMIT;

NOTIFY pgrst, 'reload schema';
