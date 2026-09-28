-- Migration : la catégorie « L'association » du TCG.
-- Date: 2026-09-28
--
-- WHY. Le TCG parle des joueuses, des équipes, des maps, des mascottes et des
--   fan arts de la communauté — jamais de l'association elle-même. Cette
--   catégorie réunit ses visuels : les LOGOS D'ÉVÉNEMENT (Octobre rose, Noël…,
--   ceux de `site_settings.seasonal_logos`) et les images que le staff dépose
--   depuis le back-office.
--
-- UNE CATÉGORIE, PAS UN SIXIÈME TYPE DE CARTE. Une carte de l'association est
--   une image, un titre, un crédit et une rareté choisie à la main : exactement
--   une fan art. Elle vit donc dans `tcg_fanart_cards`, distinguée par
--   `category`, et hérite sans rien réécrire du tirage (emplacement de décor),
--   des échanges, de la forge, de la vitrine et du recyclage. Un nouveau
--   `subject_kind` aurait imposé de recopier les deux CHECK de `tcg_pack_cards`
--   et les fonctions SQL d'échange et de forge — l'erreur qui a coûté 58
--   paquets le 2026-09-14 était justement un CHECK élargi à moitié.
--
-- PAS DE PROPOSANTE. `submitted_by` devient NULLABLE pour cette catégorie
--   seulement : une carte de l'association appartient à l'association, pas au
--   compte du staff qui l'a déposée. Avec `submitted_by` renseigné, la
--   suppression de ce compte (droit à l'effacement,
--   `utils/player/personalDataTables.ts`) retirerait les cartes de tout le
--   monde. Qui l'a déposée reste tracé par `reviewed_by` et le journal staff.
--
-- `source_ref` : l'origine d'une carte importée (`seasonal:<id du logo>`).
--   Unique par espace — importer deux fois le même logo ne crée pas deux cartes.
--
-- CAVEATS:
--   - Additive et idempotente. Les lignes existantes prennent `fanart`.
--   - Rollback : DROP des deux colonnes et des deux contraintes APRÈS avoir
--     requalifié ou retiré les cartes `association`, puis rétablir NOT NULL.
--   - APPLIQUÉE en production le 2026-09-28.

BEGIN;

ALTER TABLE public.tcg_fanart_cards
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'fanart';

ALTER TABLE public.tcg_fanart_cards
  DROP CONSTRAINT IF EXISTS tcg_fanart_category_check;
ALTER TABLE public.tcg_fanart_cards
  ADD CONSTRAINT tcg_fanart_category_check
  CHECK (category IN ('fanart', 'association'));

ALTER TABLE public.tcg_fanart_cards
  ADD COLUMN IF NOT EXISTS source_ref text
    CHECK (source_ref IS NULL OR char_length(source_ref) BETWEEN 3 AND 120);

COMMENT ON COLUMN public.tcg_fanart_cards.category IS
  '''fanart'' = proposée par la communauté et modérée ; ''association'' = visuel de l''association (logo d''événement, dépôt staff).';
COMMENT ON COLUMN public.tcg_fanart_cards.source_ref IS
  'Origine d''une carte importée (''seasonal:<id>''). Unique par espace.';

-- Une fan art a TOUJOURS une proposante ; seule l'association peut s'en passer.
ALTER TABLE public.tcg_fanart_cards
  ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE public.tcg_fanart_cards
  DROP CONSTRAINT IF EXISTS tcg_fanart_submitter_check;
ALTER TABLE public.tcg_fanart_cards
  ADD CONSTRAINT tcg_fanart_submitter_check
  CHECK (category = 'association' OR submitted_by IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tcg_fanart_source_ref
  ON public.tcg_fanart_cards (tenant_id, source_ref)
  WHERE source_ref IS NOT NULL;

-- Le panneau staff et le catalogue public lisent une catégorie à la fois.
CREATE INDEX IF NOT EXISTS idx_tcg_fanart_category
  ON public.tcg_fanart_cards (tenant_id, category, created_at DESC);

COMMIT;

NOTIFY pgrst, 'reload schema';
