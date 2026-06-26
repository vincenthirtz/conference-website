-- Migration: créer la table `news_comments` — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Source historique (loose, non versionnée) : database/news_comments.sql
--
-- WHY:
--   Table créée en prod via un fichier loose (database/news_comments.sql) jamais
--   versionné. Elle est lue/écrite par /api/news/comments (service-role) et
--   référencée par enable_rls_news_tables.sql qui suppose son existence.
--   On versionne le DDL d'origine à l'identique pour rendre la base
--   reconstructible. Aucun changement de comportement.
--
-- WHAT:
--   - CREATE TABLE IF NOT EXISTS public.news_comments (identique au loose).
--   - FK news_id -> public.news(id) ON DELETE CASCADE (nom implicite
--     news_comments_news_id_fkey, conforme à l'existant prod).
--   - Index (news_id, created_at DESC).
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout).
--   - RLS géré séparément par enable_rls_news_tables.sql (service-role-only).
--   - La FK news_id existe déjà en prod -> pas de nouvelle relation PostgREST,
--     pas de reload du schema cache requis sur une base où la table existe déjà.
--     (Sur une base reconstruite à neuf, recharger le cache après application.)
--   - Dépend de la table public.news (créée par create_news_table.sql) — appliquer
--     create_news_table.sql AVANT celle-ci sur une base vierge.

CREATE TABLE IF NOT EXISTS public.news_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES public.news (id) ON DELETE CASCADE,
  author_name text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_comments_news_id_created_at
  ON public.news_comments (news_id, created_at DESC);
