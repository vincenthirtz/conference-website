/* ---------------------------------------------------------------------------
 * tcg_tournament_participation_reward.sql — une équipe en DNF touche des
 * pièces pour sa participation
 *
 * WHY. Une équipe disqualifiée d'une phase (DNF, `stage_teams.disqualified_at`,
 * cf. `add_disqualification_to_stage_teams.sql`) repartait sans rien du TCG :
 * hors palmarès, ses joueuses n'avaient que leurs victoires de match. Décision
 * produit du 2026-10-12 (cas Éclypse) : chaque joueuse de l'équipe reçoit
 * 1000 pièces pour avoir participé, et l'équipe en est prévenue dans son salon
 * Discord.
 *
 * WHAT. Une nouvelle origine `tournament_participation` au porte-monnaie,
 * écrite par `utils/tcg/grantTournamentParticipation.ts` (à la
 * disqualification, et par la route admin
 * `POST /api/admin/stages/[stageId]/participation-reward` pour le rattrapage).
 * `source_ref` = le tournoi : la contrainte UNIQUE (tenant, user, source_kind,
 * source_ref) fait qu'un second déclenchement ne paie pas deux fois.
 *
 * DES PIÈCES SEULES : `tcg_packs` n'est pas touchée, ses deux contraintes
 * (`tcg_packs_source_kind_check` et `tcg_packs_source_coherent`) non plus.
 *
 * LA LISTE EST CELLE DE LA PRODUCTION au 2026-10-12 (lue dans `pg_constraint`,
 * pas recopiée de la migration précédente), plus la nouvelle valeur.
 *
 * CAVEATS:
 *   - Tant que la migration n'est pas appliquée, le crédit est refusé par le
 *     CHECK (23514), journalisé, et AUCUN message n'est envoyé à l'équipe : la
 *     disqualification elle-même n'est pas gênée. La route admin rejoue le
 *     crédit une fois la migration passée.
 *   - IDEMPOTENTE : la contrainte est recréée à l'identique plus la valeur.
 *
 * NON APPLIQUÉE à la rédaction (2026-10-12).
 * ------------------------------------------------------------------------- */

BEGIN;

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;

ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_source_kind_check
  CHECK (source_kind = ANY (ARRAY[
    'match_win'::text,
    'match_loss'::text,
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
    'match_prediction'::text,
    'card_forged'::text,
    'showcase_cosmetic'::text,
    'public_mvp'::text,
    'tournament_participation'::text
  ]));

COMMIT;

NOTIFY pgrst, 'reload schema';
