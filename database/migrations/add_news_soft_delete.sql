-- Migration: news.deleted_at (suppression douce des actualités)
-- Date: 2026-10-06
--
-- WHY:
--   La suppression d'une actualité depuis l'admin effaçait la ligne (et, par
--   la FK ON DELETE CASCADE, tous ses commentaires) : aucun retour possible
--   après une fausse manœuvre. Les autres contenus éditoriaux (équipes,
--   phases, partenaires…) passent déjà par la corbeille.
--
-- WHAT:
--   - news.deleted_at TIMESTAMPTZ NULL (idempotent).
--   - Index partiel pour la corbeille et la purge (deleted_at IS NOT NULL).
--
-- COMPORTEMENT APPLICATIF (features/admin/news/repository.ts) :
--   - suppression = deleted_at = now() + status = 'draft' : les lectures
--     publiques filtrent toutes `status = 'published'`, l'actualité disparaît
--     du site sans qu'elles aient à lire deleted_at ;
--   - les lectures admin filtrent deleted_at IS NULL ;
--   - restauration (corbeille) = deleted_at = NULL ; l'actualité revient en
--     brouillon, à republier sciemment ;
--   - purge définitive après PURGE_RETENTION_DAYS (90 j) par
--     /api/cron/recycle-bin-purge, ou à la main par un owner.
--
-- CAVEATS:
--   - Le slug d'une actualité en corbeille reste pris (UNIQUE (tenant_id, slug))
--     jusqu'à sa purge.
--   - Tant que cette migration n'est pas appliquée, le code retombe sur
--     l'ancien effacement définitif (cf. recycle-bin/missingColumn.ts) : aucune
--     panne, mais pas de corbeille pour les actualités.
--   - Purement additive. NOTIFY final pour que PostgREST voie la colonne sans
--     attendre le rechargement périodique de son cache de schéma.

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_news_deleted_at
  ON public.news (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.news.deleted_at IS
  'Mise à la corbeille (NULL = active). Purge définitive après 90 jours (cron recycle-bin-purge).';

NOTIFY pgrst, 'reload schema';
