-- Migration: créer la table `news` (+ trigger updated_at) — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Source historique (loose, non versionnée) : database/news.sql
--
-- WHY:
--   La table `news` a été créée en prod via un fichier loose (database/news.sql)
--   jamais intégré au système de migrations. Conséquence : la base n'était pas
--   reconstructible depuis database/migrations/ seul. Plusieurs migrations
--   ultérieures (enable_rls_news_tables.sql, etc.) SUPPOSENT déjà l'existence de
--   `news` sans jamais la créer.
--   Cette migration versionne fidèlement le DDL d'origine, à l'identique
--   (colonnes / types / contraintes / index / trigger). Aucun changement de
--   comportement : c'est de la traçabilité, pas une évolution de schéma.
--
-- WHAT:
--   - CREATE TABLE IF NOT EXISTS public.news (identique à database/news.sql).
--   - Colonne `tag` réaffirmée via ADD COLUMN IF NOT EXISTS (cas table préexistante).
--   - Index published_at / status / tag.
--   - Fonction générique public.update_updated_at_column() (CREATE OR REPLACE,
--     idempotente, partagée avec d'autres tables) + trigger BEFORE UPDATE.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout, CREATE OR REPLACE FUNCTION,
--     DROP TRIGGER IF EXISTS avant CREATE TRIGGER.
--   - RLS : volontairement NON activé ici — c'est le rôle dédié de la migration
--     enable_rls_news_tables.sql (service-role-only). On ne duplique pas.
--   - Pas de FK ajoutée par rapport à l'existant prod -> pas de reload du schema
--     cache PostgREST requis.
--   - Requiert l'extension uuid-ossp (uuid_generate_v4) ou pgcrypto déjà présents,
--     ainsi que la table public.staff (FK author_id) — toutes deux déjà en prod.

CREATE TABLE IF NOT EXISTS public.news (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  tag text NOT NULL DEFAULT 'general',
  excerpt text,
  content text NOT NULL,
  image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  author_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_published_at_idx
  ON public.news (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS news_status_idx
  ON public.news (status);

CREATE INDEX IF NOT EXISTS news_tag_idx
  ON public.news (tag);

-- En cas de table préexistante sans la colonne tag, l'assurer présente.
ALTER TABLE IF EXISTS public.news
  ADD COLUMN IF NOT EXISTS tag text NOT NULL DEFAULT 'general';

-- Fonction générique de maintien de updated_at (partagée, idempotente).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS news_update_updated_at ON public.news;
CREATE TRIGGER news_update_updated_at
BEFORE UPDATE ON public.news
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
