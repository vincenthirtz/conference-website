-- Migration : trois voies de gain sans match deviennent écrivables — le paquet
--             du drop Twitch, la série de check-ins, le palmarès de tournoi.
-- Date: 2026-09-15
--
-- WHY:
--   Le registre `utils/tcg/earnSources.ts` décrit sept voies de gain ; trois
--   n'étaient pas tenues :
--
--   1. LE DROP TWITCH NE CRÉAIT PAS SON PAQUET. Le registre lui en attribue un
--      (`packs: 1`), le webhook ne créditait que des pièces : `tcg_packs`
--      n'avait aucune origine pour un paquet de direct. On ajoute `drop`.
--
--   2. `checkin_streak` ET `tournament_placement` N'AVAIENT NI ORIGINE NI
--      ÉCRIVAIN. Le registre les marquait `schemaReady: false` : le CHECK du
--      porte-monnaie les refusait. On les ajoute au porte-monnaie, et on
--      ajoute côté paquets `streak` et `placement`, dans le vocabulaire de
--      `tcg_packs` (qui diffère de celui du porte-monnaie, comme
--      `welcome` / `welcome_gift`).
--
-- ⚠️ DEUX TABLES, TROIS CONTRAINTES, ET AUCUNE NE PEUT ÊTRE OUBLIÉE.
--   Le 2026-09-14, élargir `tcg_packs_source_kind_check` sans
--   `tcg_packs_source_coherent` — dont le nom ne dit pas qu'elle contraint
--   `source_kind` — a fait rejeter 58 paquets en 23514. Les contraintes des
--   deux tables ont donc été ÉNUMÉRÉES d'après les migrations
--   (`create_tcg_currency_tables.sql`, `tcg_packs_allow_purchased.sql`,
--   `tcg_twitch_drop.sql`, `tcg_welcome_gift.sql`,
--   `tcg_welcome_gift_pack_coherence.sql`, `tcg_supporter_welcome.sql`) :
--
--     tcg_wallet_entries_source_kind_check  ← élargie ici
--     tcg_wallet_entries.amount <> 0        ← inchangée (montants > 0)
--     tcg_packs_source_kind_check           ← élargie ici
--     tcg_packs_source_coherent             ← élargie ici
--
--   AVANT D'APPLIQUER, revérifier sur la base réelle qu'il n'en existe pas
--   d'autre (une contrainte posée à la main n'apparaît dans aucun fichier) :
--
--     SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE conrelid = ANY (ARRAY['public.tcg_packs'::regclass,
--                                 'public.tcg_wallet_entries'::regclass])
--       AND contype = 'c';
--
-- L'IDEMPOTENCE NE VIENT PAS DE `tcg_packs`, et c'est le piège connu.
--   Ces trois paquets n'ont pas de match : `source_match_id` vaut NULL, et
--   deux NULL sont DISTINCTS dans `tcg_packs_one_per_match`. La protection est
--   dans l'ORDRE d'écriture (`utils/tcg/grantCoinsThenPacks.ts`) : le
--   porte-monnaie d'abord, dont l'unicité `(tenant_id, user_id, source_kind,
--   source_ref)` est bien réelle, puis un paquet aux seules lignes que le
--   `ON CONFLICT DO NOTHING ... RETURNING` a rendues.
--
--   Ce que `source_ref` contient décide de la limite — c'est la clé, pas un
--   compteur :
--     twitch_drop          → `<broadcaster>:<startedAt>`   (un par direct)
--     checkin_streak       → `<tournoi>:<match qui clôt la série>`
--     tournament_placement → `<tournoi>`                    (un par tournoi)
--
-- POURQUOI PAS UNE COLONNE `source_ref` SUR `tcg_packs` : l'ancre existe déjà
--   dans le porte-monnaie, et une seconde clé d'unicité pour le même fait
--   serait une seconde vérité libre de diverger de la première.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne distribue rien, ne rattrape
--   rien. Elle lève trois verrous.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : APPLIQUER AVANT DE DÉPLOYER le code qui bascule
--   `schemaReady` (même lot). Code déployé sans migration :
--     - drop : les pièces passent, le paquet est rejeté (23514) — le webhook
--       l'annonce `pack: null`, mais ce drop-là ne recevra jamais son paquet ;
--     - série / palmarès : l'écriture des pièces est rejetée, rien n'est
--       crédité. Une finalisation relancée (même classement) répare le
--       palmarès ; une série manquée, elle, n'est pas rejouée.
--
-- CAVEATS:
--   - Idempotente : DROP CONSTRAINT IF EXISTS avant chaque recréation.
--   - Purement ADDITIVE : des CHECK ÉLARGIS. Élargir une contrainte ne peut
--     invalider aucune ligne existante.
--   - Les listes sont RECOPIÉES en entier parce qu'un CHECK se remplace, il ne
--     s'augmente pas. Elles doivent rester en phase avec `earnSources.ts` et
--     `grantCoinsThenPacks.ts` (`TcgMatchlessPackSourceKind`).
--   - NON APPLIQUÉE à la rédaction (2026-09-15) : en attente de validation.

/* ---------------------------------------------------------------------------
 * 1) Le porte-monnaie accepte la série de check-ins et le palmarès
 * ------------------------------------------------------------------------- */

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
      -- Une série de check-ins close. `source_ref` = `<tournoi>:<match>` : le
      -- match qui CLÔT la série, donc une récompense par fenêtre et par
      -- personne — et une série reprise après une rupture a sa propre clé.
      'checkin_streak',
      -- Palmarès de fin de tournoi. `source_ref` = le tournoi : une
      -- récompense par personne et par tournoi, quel que soit le rang.
      'tournament_placement'
    )
  );

/* ---------------------------------------------------------------------------
 * 2) Les paquets acceptent trois origines sans match
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_kind_check;

ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_kind_check
  CHECK (
    source_kind IN (
      'victory',
      'purchase',
      'welcome',
      -- Drop réclamé pendant un direct Twitch.
      'drop',
      -- Palmarès de fin de tournoi (un à trois paquets selon le rang).
      'placement',
      -- Série de check-ins.
      'streak'
    )
  );

-- LA SECONDE CONTRAINTE, celle qu'on oublie. Une victoire exige un match ;
-- toutes les autres origines l'INTERDISENT — un paquet de drop ou de série qui
-- citerait un match entrerait en collision avec le paquet de victoire du même
-- match (même `tcg_packs_one_per_match`), et la joueuse perdrait l'un des deux.
ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_coherent;

ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_coherent CHECK (
    (source_kind = 'victory' AND source_match_id IS NOT NULL)
    OR (
      source_kind IN ('purchase', 'welcome', 'drop', 'placement', 'streak')
      AND source_match_id IS NULL
    )
  );

COMMENT ON COLUMN public.tcg_packs.source_kind IS
  'victory = match gagné (source_match_id obligatoire) ; purchase = acheté en pièces ; welcome = cadeau d''accueil ; drop = drop Twitch en direct ; placement = palmarès de tournoi ; streak = série de check-ins. Hors victory, source_match_id est NULL : l''idempotence vient alors de tcg_wallet_entries (pièces écrites d''abord, paquet aux seules lignes insérées).';

-- PostgREST doit revoir son cache de schéma, sinon les contraintes modifiées
-- restent invisibles à l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
