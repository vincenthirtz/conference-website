-- Migration (DONNÉES) : les gains `scrim_win` déjà versés passent sous la clé
--                        STABLE du scrim, `scrim:<scrim_id>`.
-- Date: 2026-09-15
-- Statut : NON APPLIQUÉE à la rédaction.
--
-- WHY — pièces et paquets infinis, confirmé par l'audit du 2026-09-15.
--   La récompense d'une victoire de scrim était clée sur le MATCH MIROIR
--   (`source_ref = matches.id`, `tcg_packs.source_match_id = matches.id`). Or ce
--   miroir était SUPPRIMÉ physiquement dès que le scrim cessait d'être
--   éligible (litige, dé-classement, corbeille), puis RECRÉÉ avec un nouvel id
--   quand il le redevenait. Boucle, sans complice : la capitaine gagnante
--   re-rapporte un score contraire (litige → miroir supprimé, paquet parti en
--   cascade), puis re-rapporte le bon score (accord avec le report adverse
--   resté en base → nouveau miroir → nouveau paquet, nouvelles pièces).
--
--   Le code corrigé (`utils/tcg/grantVictoryRewards.ts`) écrit désormais
--   `source_ref = 'scrim:<scrim_id>'` et n'accorde le paquet qu'aux joueuses
--   que CETTE écriture a créditées. Un scrim ne paie donc plus qu'une fois par
--   joueuse, quel que soit le nombre de miroirs qu'il a connus.
--
-- POURQUOI CETTE MIGRATION. Les gains versés AVANT le correctif portent encore
-- l'id du miroir. Sans réécriture, le premier re-paiement d'un scrim déjà payé
-- (litige arbitré par le staff, par exemple) ne trouverait pas de conflit sous
-- la nouvelle clé et créditerait UNE fois de plus. On réécrit donc la clé des
-- écritures dont le miroir existe encore.
--
-- CE QUE LA MIGRATION NE PEUT PAS RATTRAPER. Une écriture dont le miroir a
-- DÉJÀ été supprimé ne dit plus à quel scrim elle appartient (`matches` a
-- disparu, `tcg_packs` et `player_rating_history` avec lui). Ces écritures
-- orphelines restent sous l'ancienne clé : un scrim qui en a une et qui est
-- repayé après le déploiement créditera une fois de plus — UNE seule, la
-- nouvelle clé bloquant ensuite. Pour les repérer (audit, pas correction) :
--
--   SELECT e.tenant_id, e.user_id, e.source_ref, e.amount, e.created_at
--   FROM public.tcg_wallet_entries e
--   LEFT JOIN public.matches m ON m.id::text = e.source_ref
--   WHERE e.source_kind = 'scrim_win'
--     AND e.source_ref NOT LIKE 'scrim:%'
--     AND m.id IS NULL
--   ORDER BY e.user_id, e.created_at;
--
--   Plusieurs lignes orphelines pour la même joueuse, rapprochées dans le
--   temps, sont la signature de l'exploitation de la boucle.
--
-- PLUSIEURS MATCHS POUR UN MÊME SCRIM. Un scrim peut porter des matchs créés
-- par le staff ou le bot (`/api/admin/scrims/[id]/matches`). Si une joueuse a
-- été payée pour deux d'entre eux, une seule écriture prend la clé du scrim (la
-- plus ancienne) ; les autres gardent leur clé d'origine — l'unicité du
-- registre interdirait deux lignes sous la même clé, et rien n'est repris.
--
-- ORDRE DE DÉPLOIEMENT : APRÈS le site (qui écrit la nouvelle clé), le plus tôt
-- possible. Elle est REJOUABLE : l'appliquer aussi avant le site ne casse rien
-- (l'ancien code n'écrit que des clés d'id de match, qu'une seconde passe
-- réécrira). Ce que coûte le délai entre site et migration : un scrim déjà payé
-- qui repasse de « litige » à « terminé » pendant cette fenêtre crédite une
-- fois de plus (sans nouveau paquet : le miroir, désormais conservé, bloque).
--
-- IDEMPOTENTE : ne touche que les clés qui ne commencent pas par `scrim:` et
-- dont la cible n'existe pas déjà. Aucune colonne ni table modifiée.

BEGIN;

WITH legacy AS (
  SELECT
    e.id,
    e.tenant_id,
    e.user_id,
    'scrim:' || m.scrim_id::text AS new_ref,
    row_number() OVER (
      PARTITION BY e.tenant_id, e.user_id, m.scrim_id
      ORDER BY e.created_at, e.id
    ) AS rn
  FROM public.tcg_wallet_entries e
  JOIN public.matches m
    ON m.id::text = e.source_ref
   AND m.tenant_id = e.tenant_id
  WHERE e.source_kind = 'scrim_win'
    AND e.source_ref NOT LIKE 'scrim:%'
    AND m.scrim_id IS NOT NULL
)
UPDATE public.tcg_wallet_entries e
SET source_ref = l.new_ref
FROM legacy l
WHERE e.id = l.id
  AND l.rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.tcg_wallet_entries d
    WHERE d.tenant_id = l.tenant_id
      AND d.user_id = l.user_id
      AND d.source_kind = 'scrim_win'
      AND d.source_ref = l.new_ref
  );

COMMIT;
