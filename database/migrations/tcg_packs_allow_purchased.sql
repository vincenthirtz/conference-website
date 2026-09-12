-- Migration: un paquet TCG peut exister sans victoire (achat en pièces).
-- Date: 2026-09-13
--
-- WHY:
--   `create_tcg_tables.sql` posait `source_match_id NOT NULL` : la table
--   supposait que TOUT paquet vient d'une victoire. C'était vrai au moment où
--   elle a été écrite, et faux dès que la monnaie permet d'en acheter un. Un
--   paquet acheté n'a pas de match source.
--
-- POURQUOI CETTE FORME, ET PAS UNE SECONDE TABLE.
--   Un paquet acheté et un paquet gagné s'ouvrent de la même façon, contiennent
--   les mêmes cartes et se listent ensemble. Deux tables obligeraient chaque
--   lecture à faire l'union des deux, et chaque évolution à être écrite deux
--   fois. Une colonne d'origine suffit.
--
-- L'IDEMPOTENCE DES VICTOIRES SURVIT INTACTE, grâce à une propriété de
--   Postgres : dans une contrainte UNIQUE, deux NULL sont DISTINCTS. La
--   contrainte `UNIQUE (tenant_id, user_id, source_match_id)` continue donc
--   d'interdire deux paquets pour le même match, tout en laissant coexister
--   autant de paquets achetés (`source_match_id IS NULL`) que voulu. Rien à
--   reconstruire.
--
-- LE CHECK LIE L'ORIGINE À SA PREUVE :
--   - `victory`  exige un match (sans lui, on ne saurait pas d'où vient le
--                paquet ni empêcher un doublon) ;
--   - `purchase` interdit un match (un achat qui en citerait un serait une
--                victoire déguisée, et fausserait la contrainte d'unicité).
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS / DROP ... IF EXISTS partout.
--   - Les lignes existantes sont toutes des victoires : le DEFAULT 'victory'
--     les qualifie correctement, aucune reprise de données nécessaire.
--   - Ajout purement additif : aucune colonne supprimée, aucune valeur perdue.

ALTER TABLE public.tcg_packs
  ALTER COLUMN source_match_id DROP NOT NULL;

ALTER TABLE public.tcg_packs
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'victory';

-- Deux temps (DROP puis ADD) pour rester rejouable : une contrainte déjà
-- présente ferait échouer l'ajout.
ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_kind_check;
ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_kind_check
  CHECK (source_kind IN ('victory', 'purchase'));

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_coherent;
ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_coherent CHECK (
    (source_kind = 'victory' AND source_match_id IS NOT NULL)
    OR
    (source_kind = 'purchase' AND source_match_id IS NULL)
  );

-- « Mes paquets achetés » et le comptage par origine.
CREATE INDEX IF NOT EXISTS idx_tcg_packs_source_kind
  ON public.tcg_packs (tenant_id, user_id, source_kind);

COMMENT ON COLUMN public.tcg_packs.source_kind IS
  'victory = offert par un match gagne (source_match_id obligatoire) ; purchase = achete en pieces (source_match_id NULL). Les NULL etant distincts dans une contrainte UNIQUE, l''unicite par match survit telle quelle.';
