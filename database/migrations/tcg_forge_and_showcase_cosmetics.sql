-- Migration : la FORGE et les COSMÉTIQUES DE VITRINE — deux débits pour une
-- monnaie qui ne se dépensait pas.
-- Date: 2026-09-27
-- Lot T2 de docs/PLAN-tcg.md.
--
-- WHY. Au 2026-09-27, la production disait : 10 805 pièces gagnées,
--   **zéro dépensée**. Douze porte-monnaie peuvent s'offrir le booster à 300
--   pièces, aucun ne l'a fait — et on les comprend : payer pour cinq cartes de
--   plus quand on a déjà un paquet non ouvert en attente n'a aucun intérêt. Une
--   monnaie qu'on accumule sans jamais la dépenser cesse d'être une monnaie,
--   c'est un compteur.
--
--   Le booster était le SEUL débit, et il offrait « plus de la même chose ».
--   Les deux ajoutés ici répondent chacun à un manque constaté :
--
--   1. LA FORGE. Les doublons s'accumulent sans valeur : le recyclage à 30
--      pièces a été utilisé UNE fois en tout. La forge les consomme pour un
--      tirage CIBLÉ — un sujet d'une rareté supérieure, et qu'on ne possède
--      pas. C'est ce que veulent les collections : la meilleure réunit 3
--      équipes sur 10 et 3 maps sur 22, personne n'a jamais complété une série.
--
--   2. LES COSMÉTIQUES DE VITRINE. Deux vitrines configurées sur 63 comptes.
--      Rien n'y récompense l'effort, et rien ne s'y dépense.
--
-- CE QUI NE CHANGE PAS, ET NE SE NÉGOCIE PAS : la monnaie SE GAGNE, elle ne
--   s'achète pas. Ces deux débits ne consomment que des pièces gagnées ; aucune
--   voie d'achat en euros n'est ouverte, ni directement ni par un
--   intermédiaire. C'est ce qui tient la fonctionnalité hors du régime des
--   boîtes à butin (interdites BE/NL, surveillées par l'ANJ — cf. docs/TCG.md).
--
-- ⚠️ LES DEUX CONTRAINTES DE `tcg_packs`, ET NON UNE. La table porte
--   `tcg_packs_source_kind_check` ET `tcg_packs_source_coherent`, qui
--   énumèrent toutes deux `source_kind`. Le 2026-09-14, la migration du cadeau
--   d'accueil n'en avait élargi qu'une : les 58 paquets ont été rejetés par
--   l'autre, dont le nom ne dit pas qu'elle contraint cette colonne. On élargit
--   donc les DEUX, et `forge` va du côté « sans match » de la seconde.
--
-- CAVEATS:
--   - Additive et idempotente (DROP IF EXISTS avant chaque CREATE). Aucune
--     donnée existante n'est touchée.
--   - Pas de nouvelle FK → pas de reload du cache PostgREST.
--   - Rollback : rétablir les deux CHECK dans leur forme précédente et
--     supprimer les trois colonnes de `tcg_showcases`.

BEGIN;

-- ===========================================================================
-- 1) La forge : une origine de paquet, et une écriture au registre
-- ===========================================================================

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_kind_check;
ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_kind_check
  CHECK (source_kind = ANY (ARRAY[
    'victory', 'purchase', 'welcome', 'drop',
    'placement', 'streak', 'trade', 'forge'
  ]));

-- La SECONDE contrainte, celle qu'on oublie. `forge` n'a pas de match derrière
-- lui : il rejoint la branche `source_match_id IS NULL`.
ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_coherent;
ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_coherent
  CHECK (
    (source_kind = 'victory' AND source_match_id IS NOT NULL)
    OR (
      source_kind = ANY (ARRAY[
        'purchase', 'welcome', 'drop',
        'placement', 'streak', 'trade', 'forge'
      ])
      AND source_match_id IS NULL
    )
  );

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;
ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_source_kind_check
  CHECK (source_kind = ANY (ARRAY[
    'match_win', 'scrim_win', 'booster_purchase', 'admin_grant',
    'card_recycled', 'twitch_drop', 'welcome_gift', 'supporter_welcome',
    'staff_welcome', 'checkin_streak', 'tournament_placement',
    'battlenet_verified', 'collection_set', 'match_prediction',
    -- Débits du lot T2. Montants NÉGATIFS, comme `booster_purchase`.
    'card_forged', 'showcase_cosmetic'
  ]));

-- ===========================================================================
-- 2) Les cosmétiques de vitrine
-- ===========================================================================
--
-- Trois colonnes plutôt qu'une table : une vitrine est déjà une ligne UNIQUE
-- par (tenant, joueuse), et ses cosmétiques n'ont ni historique ni cardinalité
-- propre. `NULL` = le rendu par défaut, celui d'aujourd'hui.
--
-- Ce qui est ACHETÉ vit dans `unlocked_cosmetics` ; ce qui est POSÉ vit dans
-- `frame` / `background`. Séparer les deux permet de changer d'habillage sans
-- repayer, et de ne pas perdre un achat en changeant d'avis — sans quoi chaque
-- essai coûterait, ce qui dissuade exactement le geste qu'on veut encourager.

ALTER TABLE public.tcg_showcases
  ADD COLUMN IF NOT EXISTS frame text,
  ADD COLUMN IF NOT EXISTS background text,
  ADD COLUMN IF NOT EXISTS unlocked_cosmetics text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.tcg_showcases.frame IS
  'Cadre POSÉ sur la vitrine (clé du catalogue applicatif, cf. utils/tcg/cosmetics.ts). NULL = cadre par défaut. Doit figurer dans unlocked_cosmetics.';

COMMENT ON COLUMN public.tcg_showcases.background IS
  'Fond POSÉ sur la vitrine. NULL = fond par défaut. Doit figurer dans unlocked_cosmetics.';

COMMENT ON COLUMN public.tcg_showcases.unlocked_cosmetics IS
  'Cosmétiques ACHETÉS, cadres et fonds confondus (clés du catalogue applicatif). Distinct de frame/background, qui disent ce qui est POSÉ : changer d''habillage ne doit pas coûter deux fois, ni perdre un achat.';

COMMIT;
