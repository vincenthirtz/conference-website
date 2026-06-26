-- ARCHIVÉ le 2026-06-26 : versionné dans migrations/create_news_comments_table.sql
--   (DDL repris à l'identique). RLS porté par migrations/enable_rls_news_tables.sql.
--   Conservé pour historique uniquement — NE PAS exécuter, NE PAS appliquer.
-- =====================================================================

-- Table: news_comments
CREATE TABLE IF NOT EXISTS public.news_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES public.news (id) ON DELETE CASCADE,
  author_name text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_comments_news_id_created_at
  ON public.news_comments (news_id, created_at DESC);
