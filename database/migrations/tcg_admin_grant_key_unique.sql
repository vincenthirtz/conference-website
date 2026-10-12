-- Migration: une clé d'idempotence de correction staff (`admin_grant`) ne sert
-- qu'à UNE joueuse.
-- Date: 2026-10-12
--
-- WHY:
--   `POST /api/admin/tcg/grant` écrit `source_ref = idempotencyKey`. La
--   contrainte du registre est `UNIQUE (tenant_id, user_id, source_kind,
--   source_ref)` (create_tcg_currency_tables.sql) : elle inclut `user_id`, donc
--   la MÊME clé peut créditer DEUX joueuses. La route refuse bien une clé déjà
--   servie à une autre joueuse (400), mais par une relecture préalable — deux
--   requêtes concurrentes portant la même clé pour deux joueuses différentes
--   passent toutes deux la relecture, et la base accepte les deux écritures.
--   La garantie doit être dans le schéma, pas dans la prudence de l'appelant.
--
--   Index unique PARTIEL sur (tenant_id, source_kind, source_ref) restreint à
--   `admin_grant` : la seconde écriture prend un 23505, la route relit la clé
--   et répond « clé déjà servie à une autre correction » (400), sans crédit.
--
-- POURQUOI PARTIEL. Les autres sources réutilisent LÉGITIMEMENT un même
--   `source_ref` pour plusieurs joueuses : `match_win` (un match, toutes les
--   gagnantes), `welcome_gift` (une édition, toute l'équipe engagée), etc.
--   Seule `admin_grant` porte une clé d'idempotence propre à une correction
--   (uuid tiré par l'écran staff), écrite par la route grant et par
--   `tcg_admin_debit` (retrait) — vérifié dans le code le 2026-10-12.
--
-- PAQUETS DU CADEAU D'ACCUEIL — PAS DE GARDE ICI, ET C'EST VOULU.
--   `tcg_packs` n'a aucune colonne qui désigne l'édition d'un paquet `welcome`
--   (`source_match_id` est NULL). Un index sur (tenant_id, user_id) WHERE
--   source_kind = 'welcome' bloquerait le cadeau de l'édition SUIVANTE. La
--   protection reste l'ordre d'écriture de utils/tcg/grantWelcomeGift.ts
--   (pièces d'abord, unicité du registre, paquet seulement pour les lignes
--   réellement insérées). Une vraie garde demanderait une colonne de
--   référence sur `tcg_packs` : migration à part.
--
-- PRÉ-VÉRIFICATION (à lancer AVANT ; doit rendre zéro ligne, sinon la
-- création de l'index échoue et les doublons sont à arbitrer à la main) :
--
--   SELECT tenant_id, source_ref, count(*) AS n,
--          array_agg(user_id ORDER BY created_at) AS users,
--          array_agg(id ORDER BY created_at) AS entry_ids
--   FROM public.tcg_wallet_entries
--   WHERE source_kind = 'admin_grant'
--   GROUP BY tenant_id, source_ref
--   HAVING count(*) > 1;
--
-- CAVEATS:
--   - Idempotente : CREATE UNIQUE INDEX IF NOT EXISTS.
--   - Pas de CONCURRENTLY (incompatible avec une transaction) : la table est
--     petite, le verrou d'écriture dure le temps de la construction.
--   - Le code tolère l'absence de l'index (il relit la clé sans filtrer sur la
--     joueuse) : la livrer avant ou après le déploiement est sans risque.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tcg_wallet_entries_admin_grant_key
  ON public.tcg_wallet_entries (tenant_id, source_kind, source_ref)
  WHERE source_kind = 'admin_grant';

COMMENT ON INDEX public.uq_tcg_wallet_entries_admin_grant_key IS
  'Une clé d''idempotence de correction staff (admin_grant) ne sert qu''à une seule écriture, toutes joueuses confondues. Partiel : les autres sources partagent légitimement un source_ref entre joueuses.';

COMMIT;
