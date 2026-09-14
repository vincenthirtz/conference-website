-- Bascule ponctuelle : les comptes ni roster ni staff deviennent « supporter ».
-- Date: 2026-09-14 — APPLIQUÉ EN PRODUCTION (25 comptes).
--
-- Ce n'est PAS une migration de schéma : c'est un rattrapage de données, gardé
-- ici pour que l'opération soit relisible et rejouable. Rien ne l'exécute
-- automatiquement.
--
-- WHY:
--   Le rôle de compte `supporter` a été ouvert à l'inscription le 2026-09-14,
--   mais 26 comptes sur 97 étaient DÉJÀ dans ce cas — ni sur un roster, ni
--   staff — sans que rien ne les désigne. Ils se décrivaient « player »,
--   « member », « coach » ou « substitute » : des libellés hérités qui ne
--   correspondaient à aucune réalité vérifiable.
--
-- L'EXCLUSION QUI COMPTE, et la raison de la vérifier avant d'écrire.
--   Un compte peut être `teams.captain_id` d'une équipe SANS avoir de ligne
--   dans `team_members` (1 cas au 2026-09-14). Le critère « pas de
--   team_members » seul l'aurait donc déclaré supportrice alors qu'il POSSÈDE
--   une équipe. La troisième clause `NOT EXISTS (… teams.captain_id …)` est là
--   pour ça — elle n'est pas défensive, elle a réellement écarté quelqu'un.
--
-- RÉVERSIBLE PAR CONSTRUCTION. `previous_role` conserve l'ancienne valeur :
--   une écriture d'identité en masse ne doit pas détruire ce qu'elle remplace,
--   et les libellés `coach` / `substitute` portaient une information que
--   personne n'aurait pu reconstituer autrement.
--
--   Retour arrière :
--     UPDATE auth.users
--     SET raw_user_meta_data =
--           raw_user_meta_data
--           || jsonb_build_object('role', raw_user_meta_data->>'previous_role')
--           - 'previous_role'
--     WHERE raw_user_meta_data->>'previous_role' IS NOT NULL;
--
-- CE N'EST PAS UNE PORTE FERMÉE : le rôle reste une étiquette, et créer ou
--   rejoindre une équipe le fait rebasculer tout seul (cf.
--   `pages/api/teams/create-with-member.ts`). Personne n'est enfermé dans
--   « supportrice » par cette opération.
--
-- RÉPARTITION CONSTATÉE des 25 comptes basculés :
--   player 17 · member 6 · coach 1 · substitute 1
--   (le 26ᵉ, capitaine d'une équipe, a été écarté par la clause ci-dessus).

WITH cibles AS (
  SELECT u.id, u.raw_user_meta_data->>'role' AS ancien
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.auth_user_id = u.id)
    -- Possède une équipe sans figurer au roster : surtout pas « supportrice ».
    AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.captain_id = u.id)
    -- Idempotence : relancer ne réécrit pas ceux qui y sont déjà, et ne perd
    -- donc pas leur `previous_role` en l'écrasant par « supporter ».
    AND COALESCE(u.raw_user_meta_data->>'role', '') <> 'supporter'
)
UPDATE auth.users u
SET raw_user_meta_data =
      COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'supporter')
      || CASE WHEN c.ancien IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('previous_role', c.ancien) END
FROM cibles c
WHERE u.id = c.id
RETURNING u.id, c.ancien AS role_avant, u.raw_user_meta_data->>'role' AS role_apres;
