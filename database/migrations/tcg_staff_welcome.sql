/* ---------------------------------------------------------------------------
 * tcg_staff_welcome.sql — un accueil pour les personnes qui font tourner le
 * tournoi
 *
 * POURQUOI. Un compte staff (owner, admin, caster) qui ne figure sur AUCUN
 * roster n'avait aucune porte d'entrée dans le TCG :
 *   - le cadeau d'édition (`welcome_gift`) énumère les rosters engagés ;
 *   - le cadeau de supportrice exige l'étiquette de compte `supporter` ;
 *   - les pronostics REFUSENT le staff, et c'est voulu — qui arbitre ne parie
 *     pas sur ce qu'il arbitre ;
 *   - victoires et séries de check-ins supposent qu'on joue.
 * Elles arrivaient donc sur une collection vide, définitivement.
 *
 * POURQUOI UNE ORIGINE DISTINCTE, et pas `supporter_welcome` réutilisé. Deux
 * raisons, la seconde décisive :
 *   1. le registre est une piste d'audit : étiqueter un accueil de staff
 *      « supportrice » le ferait mentir ;
 *   2. `supporter_welcome` figure dans `TENANT_ATTACHING_WALLET_SOURCES` —
 *      la liste des gains qui PROUVENT une présence dans l'espace sans qu'un
 *      staff ait pu la fabriquer. Le réutiliser élargirait cette définition
 *      anti-abus par effet de bord, et c'est exactement ce qu'elle interdit.
 *      `staff_welcome` n'y figure pas, et ne doit jamais y figurer.
 *
 * MÊME MONTANT que les deux autres accueils (`WELCOME_GIFT_COINS`) : c'est le
 * même geste d'ouverture, pas un privilège.
 *
 * IDEMPOTENT : la contrainte est recréée à l'identique plus la valeur.
 * ------------------------------------------------------------------------- */

BEGIN;

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;

ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_source_kind_check
  CHECK (source_kind = ANY (ARRAY[
    'match_win'::text,
    'scrim_win'::text,
    'booster_purchase'::text,
    'admin_grant'::text,
    'card_recycled'::text,
    'twitch_drop'::text,
    'welcome_gift'::text,
    'supporter_welcome'::text,
    'staff_welcome'::text,
    'checkin_streak'::text,
    'tournament_placement'::text,
    'battlenet_verified'::text,
    'collection_set'::text,
    'match_prediction'::text
  ]));

COMMIT;

NOTIFY pgrst, 'reload schema';
