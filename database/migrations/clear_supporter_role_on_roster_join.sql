-- Migration: clear_supporter_role_on_roster_join.sql
-- Date: 2026-09-14
--
-- WHY:
--   Le rôle de compte `supporter` (ouvert à l'inscription le 2026-09-14) décrit
--   quelqu'un qui ne joue pas. Le jour où cette personne rejoint un roster,
--   l'étiquette devient fausse : son profil, la navbar et l'écran d'admin
--   continuent d'annoncer « Supportrice » alors qu'elle est dans une équipe.
--   Elle la bloquerait aussi hors du cadeau d'accueil supportrice, qui refuse
--   déjà quiconque figure sur un roster (`grantSupporterWelcome`).
--
-- POURQUOI UN TRIGGER ET NON DU CODE APPLICATIF. On entre dans un roster par
--   au moins six chemins : acceptation d'invitation (RPC `accept_invitation`,
--   elle-même appelée par deux routes), wizard public
--   `/api/teams/create-with-member`, validation d'une demande de capitanat,
--   acceptation d'une demande « rejoindre », ajout par le staff
--   (`/api/admin/**`), ajout par le bot Discord. Les recenser un par un, c'est
--   s'engager à ne jamais en oublier un — et le trigger voisin
--   `sync_team_member_battletag_verification` a été écrit exactement pour cette
--   raison, après qu'un invariant tenu côté application eut déjà divergé.
--
--   Tous ces chemins convergent vers UNE insertion dans `team_members`. C'est
--   donc là que l'invariant se pose : « aucune ligne de roster n'appartient à
--   un compte étiqueté supporter ».
--
-- ⚠️ PREMIÈRE ÉCRITURE DANS `auth.users` DEPUIS CE SCHÉMA. Les cinq fonctions
--   SECURITY DEFINER existantes (`admin_list_users`, `get_user_id_by_email`…)
--   ne font que LIRE. D'où deux précautions qui ne sont pas décoratives :
--
--     1. L'écriture est encapsulée dans un bloc EXCEPTION. Une étiquette est
--        cosmétique ; une adhésion à un roster ne l'est pas. Si la mise à jour
--        des metadata échoue — droits, contention, changement futur du schéma
--        d'auth — le trigger AVERTIT et laisse passer l'insertion. L'inverse
--        empêcherait quelqu'un de rejoindre son équipe à cause d'un libellé.
--     2. AFTER INSERT, pas BEFORE : on ne modifie pas `NEW`, on agit sur une
--        AUTRE table. Un BEFORE ferait porter à la ligne de roster le risque
--        d'un effet de bord qui ne la concerne pas.
--
-- CE QUE LE TRIGGER NE FAIT PAS:
--   - Il ne touche QUE les comptes actuellement étiquetés `supporter`. Un
--     `player`, un `manager`, un rôle staff ou un libellé hérité (`coach`,
--     `member`) est laissé strictement intact.
--   - Il ne gère pas le sens inverse. Quitter sa dernière équipe ne rend pas
--     « supportrice » : ce serait une décision produit (on ne redéfinit pas
--     quelqu'un parce qu'il a quitté un roster), et le rôle reste modifiable
--     depuis /admin/users/manage.
--   - Il ne consomme pas `previous_role` pour restaurer l'ancien libellé : la
--     personne rejoint un roster MAINTENANT, `player` (ou `manager`) est le
--     fait présent. La clé est retirée, elle a servi.
--
-- CAVEATS:
--   - SECURITY DEFINER + `search_path` épinglé : `auth.users` n'est pas
--     accessible au rôle appelant. Même stance que le trigger voisin.
--   - Le rôle posé dérive de `NEW.role`, que le trigger a déjà sous la main :
--     un manager reste manager, tout le reste devient `player`. On n'invente
--     pas une seconde table de correspondance.
--   - Idempotente : CREATE OR REPLACE + DROP TRIGGER IF EXISTS, backfill borné.
--   - Pas de reload PostgREST : aucune colonne ni FK touchée.
--   - Rollback :
--       DROP TRIGGER IF EXISTS team_members_clear_supporter_role ON public.team_members;
--       DROP FUNCTION IF EXISTS public.clear_supporter_role_on_roster_join();

BEGIN;

CREATE OR REPLACE FUNCTION public.clear_supporter_role_on_roster_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     text;
  v_nouveau  text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.raw_user_meta_data->>'role'
    INTO v_role
    FROM auth.users u
   WHERE u.id = NEW.user_id;

  -- On ne touche QUE l'étiquette devenue fausse. Tout autre rôle — y compris
  -- un rôle staff — est laissé tel quel : ce trigger corrige une description,
  -- il n'arbitre aucun droit.
  IF v_role IS DISTINCT FROM 'supporter' THEN
    RETURN NULL;
  END IF;

  -- `NEW.role` est le rôle d'ÉQUIPE (captain / player / coach / substitute /
  -- manager), dimension distincte du rôle de COMPTE. Seul `manager` a un
  -- équivalent de compte ; tout le reste décrit quelqu'un qui joue.
  v_nouveau := CASE WHEN NEW.role = 'manager' THEN 'manager' ELSE 'player' END;

  BEGIN
    UPDATE auth.users u
       SET raw_user_meta_data =
             (COALESCE(u.raw_user_meta_data, '{}'::jsonb)
              || jsonb_build_object('role', v_nouveau))
             - 'previous_role'
     WHERE u.id = NEW.user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Une étiquette ne vaut pas une adhésion. On avertit, on ne bloque pas :
    -- faire échouer l'insertion empêcherait quelqu'un de rejoindre son équipe
    -- à cause d'un libellé d'affichage.
    RAISE WARNING
      'clear_supporter_role_on_roster_join: role non mis a jour pour % (%)',
      NEW.user_id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.clear_supporter_role_on_roster_join() IS
  'Invariant : aucune ligne de team_members n''appartient a un compte etiquete supporter. Retire l''etiquette a l''entree dans un roster, quel que soit le chemin d''ecriture. N''echoue jamais l''insertion.';

DROP TRIGGER IF EXISTS team_members_clear_supporter_role ON public.team_members;

CREATE TRIGGER team_members_clear_supporter_role
  AFTER INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_supporter_role_on_roster_join();

-- Backfill : les comptes deja sur un roster ET etiquetes supporter. Il ne
-- devrait y en avoir aucun (la bascule du 2026-09-14 excluait les rosters),
-- mais l'invariant doit etre vrai AVANT que le trigger ne le maintienne.
UPDATE auth.users u
   SET raw_user_meta_data =
         (COALESCE(u.raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object(
               'role',
               CASE WHEN EXISTS (
                      SELECT 1 FROM public.team_members tm
                       WHERE tm.user_id = u.id AND tm.role = 'manager'
                    ) THEN 'manager' ELSE 'player' END))
         - 'previous_role'
 WHERE u.raw_user_meta_data->>'role' = 'supporter'
   AND EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.user_id = u.id);

COMMIT;
