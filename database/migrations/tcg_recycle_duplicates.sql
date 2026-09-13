-- Migration: recycler un doublon TCG contre des pièces.
-- Date: 2026-09-13
--
-- WHY:
--   Un doublon ne servait À RIEN. La collection les compte (« 4 cartes
--   différentes · 7 exemplaires ») mais rien n'en fait quoi que ce soit : le
--   troisième exemplaire d'une même joueuse est un objet mort. Le recyclage
--   leur donne une issue et referme la boucle économique — gagner, ouvrir,
--   recycler, racheter.
--
-- POURQUOI UNE COLONNE D'ÉTAT, ET PAS UNE SUPPRESSION DE LIGNE.
--   Supprimer la carte recyclée serait plus court. Mais tout ce socle est bâti
--   sur l'inverse : `tcg_wallet_entries` justifie chaque mouvement ligne à
--   ligne, `tcg_player_cards` conserve `opted_in_at` même après un retrait, et
--   `readCardFaces` relit les faces plutôt que de les figer. Effacer la carte
--   rendrait le crédit correspondant inexplicable — or « un solde qu'on ne peut
--   pas expliquer est un solde qu'on ne peut pas corriger ». `recycled_at`
--   garde l'histoire ET retire la carte de la collection.
--
-- PORTÉE DE LECTURE À TENIR À JOUR : deux lecteurs comptent les cartes
--   possédées et doivent ignorer les recyclées —
--   `pages/api/player/tcg/collection.ts` et la route bot
--   `players/by-discord/[discordUserId]/tcg.ts`. `packs.ts` n'est pas concerné :
--   il INSÈRE les cartes au tirage, il n'en lit pas.
--
-- POURQUOI `source_kind = 'card_recycled'` ET PAS `admin_grant`.
--   `admin_grant` est la correction manuelle tracée par `logStaffAction` : la
--   confondre avec une revente rendrait l'historique du porte-monnaie
--   mensonger, et empêcherait de distinguer un geste du staff d'un geste de la
--   joueuse. Le CHECK est élargi, jamais réécrit à l'identique.
--
-- `source_ref` PORTE LA CARTE RECYCLÉE (`<pack_id>:<position>`), ce qui donne
--   gratuitement l'idempotence : `UNIQUE (tenant_id, user_id, source_kind,
--   source_ref)` interdit de créditer deux fois le même doublon, même si la
--   requête est rejouée. La contrainte fait le travail, pas la prudence de
--   l'appelant — la leçon des quatre doublons Discord du 2026-09-12.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.
--   - Purement ADDITIVE : une colonne nullable, un CHECK ÉLARGI. Aucune ligne
--     existante ne peut devenir invalide (élargir une contrainte ne rejette
--     rien de ce qu'elle acceptait), aucune donnée n'est perdue.
--   - Le nom `tcg_wallet_entries_source_kind_check` est celui GÉNÉRÉ par
--     Postgres pour le CHECK déclaré en ligne dans
--     `create_tcg_currency_tables.sql` — vérifié sur la base avant écriture,
--     et non supposé.
--   - Les tables étaient vides à l'application (0 carte, 0 écriture) : aucune
--     reprise de données nécessaire.

/* ---------------------------------------------------------------------------
 * 1) La carte recyclée reste, marquée
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_pack_cards
  ADD COLUMN IF NOT EXISTS recycled_at timestamptz;

COMMENT ON COLUMN public.tcg_pack_cards.recycled_at IS
  'Non NULL = la carte a été recyclée contre des pièces. La ligne est CONSERVÉE pour que le crédit correspondant reste explicable ; les lecteurs de collection doivent l''ignorer.';

-- Les lecteurs de collection filtrent `recycled_at IS NULL` : index partiel sur
-- les cartes ENCORE possédées, qui est le seul cas fréquent.
CREATE INDEX IF NOT EXISTS idx_tcg_pack_cards_active
  ON public.tcg_pack_cards (pack_id)
  WHERE recycled_at IS NULL;

/* ---------------------------------------------------------------------------
 * 2) Le registre accepte une nouvelle origine
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
      -- Revente d'un doublon par la joueuse elle-même. Distincte d'
      -- `admin_grant` : confondre un geste du staff et un geste de la joueuse
      -- rendrait l'historique du porte-monnaie mensonger.
      'card_recycled'
    )
  );
