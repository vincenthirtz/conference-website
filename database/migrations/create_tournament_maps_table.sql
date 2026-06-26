-- Migration: créer la table `tournament_maps` — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Source historique (loose, non versionnée) : database/tournament_maps.sql
--
-- WHY:
--   Table créée en prod via un fichier loose (database/tournament_maps.sql, schéma
--   inféré de pages/api/tournament/[id]/maps.ts) jamais versionné. Référencée par
--   plusieurs migrations ultérieures (add_image_url_to_tournament_maps.sql,
--   add_tenant_id_to_match_domain.sql, create_match_map_vetos_table.sql,
--   enforce_tenant_id_not_null_and_fk.sql) qui supposent son existence.
--   On versionne le DDL d'origine à l'identique pour rendre la base
--   reconstructible. Aucun changement de comportement.
--
-- WHAT:
--   - CREATE TABLE IF NOT EXISTS public.tournament_maps (identique au loose,
--     colonne image_url incluse — déjà présente dans le DDL d'origine ; la
--     migration add_image_url_to_tournament_maps.sql reste no-op si la colonne
--     existe déjà).
--   - FK tournament_id -> tournaments(id) ON DELETE CASCADE.
--   - Index tournament_id / (tournament_id, order_index) / (tournament_id, enabled).
--   Le SEED de données VOD spécifique au tournoi 734b6fdb… présent dans le fichier
--   loose N'EST PAS repris ici (donnée one-shot, pas du schéma) — archivé sous
--   database/legacy/tournament_maps.sql.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout).
--   - RLS géré par la baseline (enable_rls_remaining_tables.sql).
--   - Requiert extensions.uuid_generate_v4 et la table tournaments — déjà en prod.
--   - FK déjà présente en prod -> pas de reload du schema cache sur base existante ;
--     sur base reconstruite à neuf, recharger le cache PostgREST après application.

create table if not exists public.tournament_maps (
  id uuid primary key default extensions.uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  map_name text not null,
  map_slug text null,
  map_type text null, -- ex: control, hybrid, escort, push...
  image_url text null, -- URL de l'image représentant la map
  enabled boolean not null default true,
  order_index integer null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_tournament_maps_tournament on public.tournament_maps (tournament_id);
create index if not exists idx_tournament_maps_order on public.tournament_maps (tournament_id, order_index);
create index if not exists idx_tournament_maps_enabled on public.tournament_maps (tournament_id, enabled);
