-- Migration : le CHECK de cohérence de `tcg_packs` admet le cadeau d'accueil.
-- Date: 2026-09-14
--
-- WHY — CECI RÉPARE UN INCIDENT DE PRODUCTION, pas une fonctionnalité manquante.
--   Le 2026-09-14 à 07h04 UTC, l'attribution du cadeau d'accueil de la Cup 2026
--   a crédité 58 comptes de 100 pièces et accordé ZÉRO paquet. L'email annonçant
--   « un paquet à ouvrir et 100 pièces » est parti à 07h31 à 65 destinataires.
--
--   `tcg_welcome_gift.sql` avait élargi `tcg_packs_source_kind_check` pour
--   accepter `welcome`. Mais `tcg_packs` porte DEUX contraintes sur la même
--   colonne, et la seconde — `tcg_packs_source_coherent` — n'admettait que :
--
--     (source_kind = 'victory'  AND source_match_id IS NOT NULL)
--  OR (source_kind = 'purchase' AND source_match_id IS NULL)
--
--   Aucune branche pour `welcome`. Chaque insertion partait donc en 23514,
--   quelle que soit la valeur de `source_match_id`. Élargir une seule des deux
--   contraintes ne lève rien : elles se conjuguent.
--
-- LA LEÇON, POUR LA PROCHAINE FOIS : avant d'ajouter une valeur à une colonne
--   contrainte, ÉNUMÉRER les contraintes de la table plutôt que de corriger
--   celle dont le nom ressemble au sujet —
--
--     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.tcg_packs'::regclass AND contype = 'c';
--
--   `tcg_packs_source_kind_check` portait le mot « source_kind » dans son nom ;
--   `tcg_packs_source_coherent` la contraignait tout autant, sans le dire.
--
-- POURQUOI LES TESTS N'ONT RIEN VU : le mock Supabase des tests unitaires ne
--   valide AUCUN `CHECK`. Une insertion que Postgres refuse y passe en vert.
--   C'est le même angle mort que celui des colonnes inexistantes dans
--   `.select()`. Le garde-fou réel est ici, dans le schéma — et désormais dans
--   l'écran d'administration, qui compare `packsGranted` à `granted` au lieu
--   d'annoncer un succès sans le vérifier.
--
-- RÈGLE PORTÉE : un paquet `welcome` n'a pas de match, comme un achat.
--
-- CAVEATS:
--   - Idempotente : DROP CONSTRAINT IF EXISTS avant recréation.
--   - Purement ADDITIVE : une branche de plus dans une disjonction. Élargir un
--     CHECK ne peut invalider aucune ligne existante.
--   - La disjonction est RECOPIÉE en entier parce qu'un CHECK se remplace, il
--     ne s'augmente pas. Elle doit rester en phase avec
--     `tcg_packs_source_kind_check`, juste au-dessus dans `tcg_welcome_gift.sql`.
--   - APPLIQUÉE EN PRODUCTION le 2026-09-14, suivie du rattrapage des 58
--     paquets manquants (vérifié : 58 crédités, 58 paquets, 0 doublon, 0
--     manquant). Ce fichier consigne ce que la base fait déjà.

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_coherent;

ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_coherent CHECK (
    (source_kind = 'victory' AND source_match_id IS NOT NULL)
    OR (source_kind = 'purchase' AND source_match_id IS NULL)
    OR (source_kind = 'welcome' AND source_match_id IS NULL)
  );

/* ---------------------------------------------------------------------------
 * RATTRAPAGE des paquets perdus par l'incident.
 *
 * Rejouer l'attribution ne suffirait PAS, et c'est le corollaire de son
 * idempotence : elle n'accorde un paquet qu'aux comptes que le
 * `ON CONFLICT DO NOTHING ... RETURNING` du porte-monnaie vient de rendre. Les
 * 58 entrées de pièces existant déjà, un second passage rend zéro ligne et
 * n'accorde donc rien. La réparation doit partir des pièces, pas des rosters.
 *
 * `granted_at` reprend l'horodatage du crédit pour que paquet et pièces
 * apparaissent ensemble dans l'historique de la joueuse.
 *
 * Le NOT EXISTS rend l'opération rejouable : elle ne peut pas créer de doublon,
 * ce qui compte doublement ici puisque `tcg_packs_one_per_match` ne protège de
 * rien quand `source_match_id` est NULL (deux NULL sont DISTINCTS en SQL).
 * ------------------------------------------------------------------------- */

INSERT INTO public.tcg_packs (tenant_id, user_id, source_kind, source_match_id, granted_at)
SELECT w.tenant_id, w.user_id, 'welcome', NULL, w.created_at
FROM public.tcg_wallet_entries w
WHERE w.source_kind = 'welcome_gift'
  AND NOT EXISTS (
    SELECT 1 FROM public.tcg_packs p
    WHERE p.tenant_id = w.tenant_id
      AND p.user_id = w.user_id
      AND p.source_kind = 'welcome'
  );

-- PostgREST doit revoir son cache de schéma, sinon la contrainte modifiée reste
-- invisible à l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
