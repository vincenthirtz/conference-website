-- Migration : la vérification d'un compte Battle.net rapporte des pièces TCG,
--             une fois à vie.
-- Date: 2026-09-15
--
-- WHY:
--   Vérifier son compte Battle.net est un OAuth Blizzard réel
--   (`pages/api/auth/battlenet/callback.ts`) : c'est une PREUVE de possession,
--   utile au tournoi (anti-smurf). On la récompense par des pièces
--   (`BATTLENET_VERIFIED_COINS`, `utils/tcg/earnSources.ts`), écrites par
--   `utils/tcg/grantBattlenetVerified.ts`. Pas de paquet : `tcg_packs` n'est
--   PAS touchée.
--
-- CE QUE LA CLÉ DU REGISTRE NE SAIT PAS FAIRE, ET POURQUOI DEUX INDEX.
--   `UNIQUE (tenant_id, user_id, source_kind, source_ref)` contient `user_id`.
--   Avec `source_ref = bnet:<sha256(battle_net_id)>` elle arrête un rejeu, mais
--   laisse passer :
--     - la même joueuse avec un SECOND compte Blizzard (autre source_ref) :
--       un compte Battle.net est gratuit, on remplirait un porte-monnaie à la
--       chaîne ;
--     - le même compte Blizzard sur une SECONDE joueuse, une fois le lien
--       libéré (la joueuse d'origine s'est reliée à un autre compte) ;
--     - la même joueuse dans un SECOND tenant.
--   Deux index uniques PARTIELS portent donc « une fois par personne » et « une
--   fois par compte Blizzard », TOUS TENANTS CONFONDUS. Aucune relecture
--   applicative : une relecture laisse une fenêtre (quatre doublons Discord le
--   2026-09-12).
--
--   Le `ON CONFLICT` de l'écrivain ne vise que la clé du registre : une
--   violation de ces index lève 23505, que `grantCoinsThenPacks` rend en
--   `reason: 'conflict'` et que l'écrivain lit « déjà récompensée ».
--
--   `tcg_wallet_entries.user_id` n'a PAS de clé étrangère vers auth.users :
--   supprimer un compte ne supprime pas sa ligne, et ne libère donc pas le
--   compte Blizzard pour une nouvelle récompense.
--
-- ⚠️ UN CHECK SE REMPLACE, IL NE S'AUGMENTE PAS : la liste est recopiée EN
--   ENTIER. Contraintes CHECK de `tcg_wallet_entries` connues d'après les
--   migrations : `tcg_wallet_entries_source_kind_check` (élargie ici) et
--   `amount <> 0` (inchangée, montant > 0). AVANT D'APPLIQUER, énumérer sur la
--   base réelle — une contrainte posée à la main n'apparaît dans aucun fichier :
--
--     SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE conrelid = 'public.tcg_wallet_entries'::regclass AND contype = 'c';
--
--   et vérifier que la liste en place est bien celle recopiée ci-dessous (dix
--   valeurs, `tcg_earn_sources_drop_streak_placement.sql`). Une valeur en base
--   absente d'ici ferait ÉCHOUER l'ADD CONSTRAINT (lignes existantes
--   invalides) — la transaction protège alors de tout état intermédiaire.
--
-- ORDRE DE DÉPLOIEMENT :
--   1. le bot (docker-box, `services/discord-bot/tcg-events.js`) apprend
--      `reason: 'battlenet_verified'` (sans tournoi) — sinon les DM de ce gain
--      sont ignorés et perdus ;
--   2. appliquer cette migration ;
--   3. déployer le site (qui déclare `schemaReady: true`).
--   Site déployé SANS migration : chaque vérification réussit, l'écriture des
--   pièces est rejetée (23514) et journalisée, rien n'est crédité. Rien n'est
--   perdu définitivement pour autant : une nouvelle vérification une fois la
--   migration passée crédite normalement.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne distribue rien et ne rattrape
--   rien. Les comptes vérifiés AVANT elle ne reçoivent rien automatiquement —
--   un gain n'est jamais l'effet de bord d'un déploiement (cf. docs/TCG.md).
--
-- CAVEATS:
--   - Idempotente : DROP CONSTRAINT IF EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS.
--   - Additive : CHECK élargi ; les index partiels ne portent sur aucune ligne
--     existante (la valeur `battlenet_verified` n'existait pas).
--   - CREATE INDEX non CONCURRENTLY : verrou bref, table de petite taille.
--   - Rollback : DROP INDEX des deux index, puis recréer le CHECK à dix valeurs
--     — seulement après avoir supprimé ou requalifié les lignes
--     `battlenet_verified`.
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
      -- Compte Battle.net prouvé par OAuth. `source_ref` =
      -- `bnet:<sha256(battle_net_id)>`. Une fois par personne ET par compte
      -- Blizzard, tous tenants confondus : cf. les deux index ci-dessous.
      'battlenet_verified'
    )
  );

-- Une fois par PERSONNE, tous comptes Blizzard et tous tenants confondus.
CREATE UNIQUE INDEX IF NOT EXISTS tcg_wallet_entries_battlenet_once_per_user
  ON public.tcg_wallet_entries (user_id)
  WHERE source_kind = 'battlenet_verified';

-- Une fois par COMPTE BLIZZARD, toutes personnes et tous tenants confondus.
CREATE UNIQUE INDEX IF NOT EXISTS tcg_wallet_entries_battlenet_once_per_account
  ON public.tcg_wallet_entries (source_ref)
  WHERE source_kind = 'battlenet_verified';

COMMENT ON INDEX public.tcg_wallet_entries_battlenet_once_per_user IS
  'battlenet_verified : une récompense par personne, à vie, tous tenants confondus.';
COMMENT ON INDEX public.tcg_wallet_entries_battlenet_once_per_account IS
  'battlenet_verified : une récompense par compte Blizzard (source_ref = bnet:<sha256>), tous tenants et toutes personnes confondus.';

COMMIT;

-- Cache de schéma PostgREST : contrainte modifiée.
NOTIFY pgrst, 'reload schema';
