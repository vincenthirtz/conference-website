/* ---------------------------------------------------------------------------
 * tcg_public_mvp.sql — la MVP du public touche des pièces
 *
 * POURQUOI. Le vote MVP du public (chat Twitch + supporters Discord, cf.
 * `match_public_mvp_vote.sql`) désignait une joueuse sans rien lui rapporter :
 * un titre annoncé à l'antenne, puis plus rien. C'est pourtant la seule
 * distinction individuelle que le public décerne — elle mérite de laisser une
 * trace dans la collection de celle qui la reçoit.
 *
 * QUOI. Une nouvelle origine `public_mvp` au porte-monnaie, écrite par
 * `utils/tcg/grantPublicMvp.ts` à la CLÔTURE du scrutin. `source_ref` = le
 * match : la contrainte UNIQUE (tenant, user, source_kind, source_ref) fait
 * qu'une clôture rejouée ne paie pas deux fois.
 *
 * DES PIÈCES SEULES : `tcg_packs` n'est pas touchée, ses deux contraintes
 * (`tcg_packs_source_kind_check` et `tcg_packs_source_coherent`) non plus.
 *
 * LA LISTE EST CELLE DE LA PRODUCTION au 2026-10-01 (lue dans `pg_constraint`,
 * pas recopiée de la migration précédente) : elle porte `card_forged` et
 * `showcase_cosmetic`, ajoutées par `tcg_forge_and_showcase_cosmetics.sql`.
 *
 * IDEMPOTENT : la contrainte est recréée à l'identique plus la valeur.
 *
 * APPLIQUÉE en production le 2026-10-01.
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
    'match_prediction'::text,
    'card_forged'::text,
    'showcase_cosmetic'::text,
    'public_mvp'::text
  ]));

COMMIT;

NOTIFY pgrst, 'reload schema';
