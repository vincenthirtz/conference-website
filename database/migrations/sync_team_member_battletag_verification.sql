-- Migration: sync_team_member_battletag_verification.sql
-- Date: 2026-08-30
--
-- WHY:
--   Une joueuse (YayIHealYou#2177) a lié et vérifié son compte Battle.net — son
--   panneau joueuse affiche « ✓ compte vérifié » — mais le roster de son équipe
--   la montre NON vérifiée. Deux sources, deux vérités.
--
--   `battle_tag_verified_at` / `verified_battle_net_id` sont posés en UN SEUL
--   instant : le retour d'OAuth Battle.net (`stampVerifiedTeamMembers`, appelé
--   par pages/api/auth/battlenet/callback.ts). C'est un INSTANTANÉ. Tout ce qui
--   arrive ensuite le laisse périmé, dans les deux sens :
--
--     - ligne de roster CRÉÉE après le lien (on rejoint une équipe une fois son
--       compte déjà vérifié) : rien ne la regarde, elle naît non vérifiée.
--       Observé : Clyde#22148, lien 19:01, entrée dans Eclypse 19:19 ;
--     - battle_tag CORRIGÉ après le lien : idem, la correction ne redemande
--       jamais son avis au lien. Observé : YayIHealYou#2177 et LaKiiroi#2978 ;
--     - à l'inverse, /api/teams/update-member (édition côté équipe) change le
--       tag SANS retirer l'estampille — la pastille « ✓ vérifié » reste alors
--       collée à un tag que personne n'a vérifié. C'est le faux négatif
--       anti-smurf que /api/admin/users/manage prend soin d'éviter de son côté,
--       en réinitialisant à la main. Deux chemins d'écriture, deux politiques.
--
--   Au constat : 11 lignes de roster portent le tag exact du compte vérifié de
--   leur propriétaire, 3 ne sont pas estampillées.
--
-- WHAT:
--   L'invariant — « une ligne de roster est vérifiée SI ET SEULEMENT SI son
--   battle_tag est celui du compte Battle.net vérifié de son propriétaire » —
--   descend au niveau de la base, en trigger BEFORE INSERT OR UPDATE OF
--   battle_tag/user_id.
--
--   Il tient alors quel que soit le chemin d'écriture, et ils sont nombreux :
--   /api/teams/add-member, /api/teams/update-member, /api/admin/users/manage,
--   /api/admin/teams/[teamId]/members, la RPC `accept_invitation`, les RPC
--   join/transfer, le bot Discord, le lien d'auto-inscription. Les recenser un
--   par un côté application, c'était s'engager à ne jamais en oublier un — et
--   il en manquait déjà.
--
--   Suivi d'un backfill des lignes déjà désynchronisées.
--
-- CE QUE LE TRIGGER NE FAIT PAS:
--   Il ne réagit qu'aux écritures sur `team_members`. Le sens inverse — « je
--   viens de lier mon compte, estampille mes lignes existantes » — reste porté
--   par `stampVerifiedTeamMembers` au retour d'OAuth, qui reste nécessaire et
--   inchangé. Un changement de compte Blizzard ne nettoie donc toujours pas les
--   estampilles devenues fausses ; ce sera un trigger sur `user_battlenet_links`
--   le jour où le cas se présente (aucune occurrence en base à ce jour).
--
-- CAVEATS:
--   - SECURITY DEFINER : `user_battlenet_links` est en RLS service-role only.
--     Sans ça, une écriture faite sous le rôle `authenticated` lirait zéro lien
--     et EFFACERAIT l'estampille au lieu de la poser. `search_path` est épinglé
--     (recommandation Supabase pour toute fonction SECURITY DEFINER).
--   - `UPDATE OF battle_tag, user_id` : le trigger ne se déclenche que si l'une
--     de ces colonnes figure dans le SET. Changer un rôle, une spécialité ou un
--     pseudo ne touche donc jamais à la vérification.
--   - L'estampille conserve la date de vérification du LIEN (`verified_at`),
--     pas `now()` : la pastille doit dire quand le compte a été prouvé, pas
--     quand la ligne a été réécrite.
--   - Le backfill ne fait qu'AJOUTER des estampilles manquantes (3 lignes). Il
--     n'en retire aucune : une ligne actuellement estampillée dont le tag ne
--     correspond plus (1 ligne, battle_tag vidé depuis) sera régularisée à sa
--     prochaine écriture, plutôt que dévérifiée en masse par une migration.
--   - Idempotente : CREATE OR REPLACE + DROP TRIGGER IF EXISTS, backfill borné
--     par `battle_tag_verified_at IS NULL`.
--   - Pas de reload PostgREST : aucune FK ni colonne touchée.
--   - Rollback :
--       DROP TRIGGER IF EXISTS team_members_sync_battletag_verification ON public.team_members;
--       DROP FUNCTION IF EXISTS public.sync_team_member_battletag_verification();

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_team_member_battletag_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_tag   text;
  v_link_bnet  text;
  v_link_when  timestamptz;
BEGIN
  -- Pas de propriétaire ou pas de tag : il n'y a rien à vérifier. On n'affiche
  -- pas « ✓ vérifié » sur une ligne qui ne déclare aucun BattleTag.
  IF NEW.user_id IS NULL OR NEW.battle_tag IS NULL OR btrim(NEW.battle_tag) = '' THEN
    NEW.battle_tag_verified_at := NULL;
    NEW.verified_battle_net_id := NULL;
    RETURN NEW;
  END IF;

  SELECT l.battle_tag, l.battle_net_id, l.verified_at
    INTO v_link_tag, v_link_bnet, v_link_when
    FROM public.user_battlenet_links l
   WHERE l.auth_user_id = NEW.user_id;

  IF v_link_tag IS NOT NULL
     AND lower(btrim(v_link_tag)) = lower(btrim(NEW.battle_tag))
  THEN
    -- Le tag déclaré EST celui du compte Blizzard prouvé par cette personne.
    NEW.battle_tag_verified_at := COALESCE(v_link_when, now());
    NEW.verified_battle_net_id := v_link_bnet;
  ELSE
    -- Aucun lien, ou un tag qui n'est pas celui qui a été prouvé.
    NEW.battle_tag_verified_at := NULL;
    NEW.verified_battle_net_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_team_member_battletag_verification() IS
  'Maintient l''invariant : team_members est verifie ssi son battle_tag est celui du compte Battle.net verifie de son proprietaire (user_battlenet_links).';

DROP TRIGGER IF EXISTS team_members_sync_battletag_verification ON public.team_members;

CREATE TRIGGER team_members_sync_battletag_verification
  BEFORE INSERT OR UPDATE OF battle_tag, user_id ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_team_member_battletag_verification();

-- Backfill : les lignes dont le tag correspond deja au compte verifie de leur
-- proprietaire mais que personne n'a jamais estampillees.
UPDATE public.team_members tm
   SET battle_tag_verified_at = l.verified_at,
       verified_battle_net_id = l.battle_net_id
  FROM public.user_battlenet_links l
 WHERE l.auth_user_id = tm.user_id
   AND tm.battle_tag IS NOT NULL
   AND lower(btrim(tm.battle_tag)) = lower(btrim(l.battle_tag))
   AND tm.battle_tag_verified_at IS NULL;

COMMIT;
