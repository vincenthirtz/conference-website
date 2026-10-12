/* ---------------------------------------------------------------------------
 * tcg_match_loss_reward.sql — une défaite en tournoi rapporte des pièces
 *
 * POURQUOI. Seul le camp gagnant d'un match touchait quelque chose : une
 * équipe qui perd ses matchs repartait d'un tournoi la collection vide, alors
 * qu'elle avait joué autant que l'autre. Décision produit : chaque défaite en
 * match de tournoi rapporte `MATCH_LOSS_COINS` (100 pièces, soit un tiers de
 * booster — trois défaites paient un booster, cf. `utils/tcg/economy.ts`).
 *
 * QUOI. Une nouvelle origine `match_loss` au porte-monnaie, écrite par
 * `utils/tcg/grantDefeatRewards.ts` au MÊME moment que la victoire (fin de
 * `applyMatchRatingIncremental`, quand le match vient d'être noté).
 * `source_ref` = l'id du match, comme `match_win` : la contrainte UNIQUE
 * (tenant_id, user_id, source_kind, source_ref) fait qu'un rejeu de la
 * validation ne paie pas deux fois.
 *
 * DES PIÈCES SEULES : `tcg_packs` n'est pas touchée, ses deux contraintes
 * (`tcg_packs_source_kind_check` et `tcg_packs_source_coherent`) non plus.
 *
 * CAVEATS.
 *   - LA LISTE EST CELLE DE `tcg_public_mvp.sql` (lue en production le
 *     2026-10-01) plus `match_loss`. Aucune migration postérieure ne redéfinit
 *     ce CHECK dans le dépôt ; si une valeur a été ajoutée à la main depuis,
 *     la relire dans `pg_constraint` AVANT d'appliquer, sans quoi ce fichier
 *     la retirerait.
 *   - Tant que cette migration n'est pas appliquée, l'écriture `match_loss`
 *     est refusée en 23514 et journalisée : le score, le rating et la victoire
 *     passent quand même (hook best-effort). Les défaites notées entre le
 *     déploiement du code et cette migration ne sont PAS rattrapées
 *     automatiquement.
 *
 * IDEMPOTENT : la contrainte est recréée à l'identique plus la valeur.
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
    'public_mvp'::text
  ]));

COMMIT;

NOTIFY pgrst, 'reload schema';
