-- Migration : une SÉRIE de cartes complétée rapporte des pièces TCG, une fois
--             par série et par joueuse.
-- Date: 2026-09-15
--
-- WHY:
--   Les séries (`utils/tcg/collectionSets.ts`) donnent au TCG des objectifs de
--   collection : toutes les maps d'un mode, toutes les équipes d'une édition,
--   le roster d'une équipe pour une édition. Compléter une série crédite
--   `COLLECTION_SET_COINS` (`utils/tcg/earnSources.ts`, une victoire de match),
--   écrit par `utils/tcg/grantCollectionSets.ts`. PAS DE PAQUET : `tcg_packs`
--   n'est PAS touchée — ni `tcg_packs_source_kind_check`, ni
--   `tcg_packs_source_coherent`.
--
-- L'UNICITÉ EST CELLE DU REGISTRE, SANS INDEX DE PLUS.
--   `UNIQUE (tenant_id, user_id, source_kind, source_ref)` avec
--   `source_ref = <identifiant stable de la série>` (`maps:<mode>`,
--   `tournament:<tournoi>`, `roster:<tournoi>:<équipe>`) dit exactement « une
--   fois par série et par joueuse, dans cet espace ». Recycler une carte après
--   la récompense ne la reprend pas ; recompléter la série ne recrédite rien.
--   Aucune relecture applicative ne sert de garde-fou (quatre doublons Discord
--   le 2026-09-12).
--
-- ⚠️ UN CHECK SE REMPLACE, IL NE S'AUGMENTE PAS : la liste est recopiée EN
--   ENTIER. Elle reprend les ONZE valeurs en production (dont
--   `battlenet_verified`, `tcg_battlenet_verified.sql`) et ajoute
--   `collection_set`. AVANT D'APPLIQUER, énumérer sur la base réelle — une
--   contrainte posée à la main n'apparaît dans aucun fichier :
--
--     SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE conrelid = 'public.tcg_wallet_entries'::regclass AND contype = 'c';
--
--   Vérifier que la liste en place est bien celle des onze valeurs recopiées
--   ci-dessous. Une valeur en base absente d'ici ferait ÉCHOUER l'ADD
--   CONSTRAINT (lignes existantes invalides) — la transaction protège alors de
--   tout état intermédiaire. Cette migration ne touche PAS aux deux index
--   partiels de `battlenet_verified`.
--
-- ORDRE DE DÉPLOIEMENT :
--   1. le bot (docker-box, `services/discord-bot/tcg-events.js`) apprend
--      l'événement `tcg.set_completed` — sinon les DM de ce gain sont perdus
--      (l'outbox ne les rejoue pas) ;
--   2. appliquer cette migration (et `tcg_showcases.sql`) ;
--   3. déployer le site (qui déclare `schemaReady: true`).
--   Site déployé SANS migration : les séries s'affichent, chaque écriture de
--   récompense est refusée (23514) et journalisée, RIEN n'est crédité — et rien
--   n'est perdu : la vérification paresseuse de `GET /api/player/tcg/sets`
--   retente à chaque lecture, et crédite dès la migration passée.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne distribue rien. Les séries déjà
--   complètes sont rattrapées par la joueuse elle-même, à sa prochaine visite
--   de `/player/tcg` — c'est un geste de sa part (ouvrir sa collection), pas un
--   effet de bord de déploiement.
--
-- CAVEATS:
--   - Idempotente : DROP CONSTRAINT IF EXISTS puis ADD.
--   - Additive : aucune ligne existante ne porte `collection_set`.
--   - Rollback : recréer le CHECK à onze valeurs — seulement après avoir
--     supprimé ou requalifié les lignes `collection_set`.
--   - NON APPLIQUÉE à la rédaction (2026-09-15).

BEGIN;

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;

ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_source_kind_check
  CHECK (
    source_kind IN (
      'match_win',
      'scrim_win',
      'booster_purchase',
      'admin_grant',
      'card_recycled',
      'twitch_drop',
      'welcome_gift',
      'supporter_welcome',
      'checkin_streak',
      'tournament_placement',
      'battlenet_verified',
      -- Série complétée. `source_ref` = identifiant stable de la série :
      -- une fois par série, par joueuse et par espace (clé du registre).
      'collection_set'
    )
  );

COMMIT;

-- Cache de schéma PostgREST : contrainte modifiée.
NOTIFY pgrst, 'reload schema';
