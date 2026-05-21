-- Migration: S6b.2 multi-tenant — table `pending_guild_links`
-- Date: 2026-05-21
--
-- WHY:
--   Quand le bot Discord rejoint un nouveau guild (event `guildCreate`), il
--   appelle `POST /api/bot/v1/tenants/link-guild` pour signaler ce guild au
--   site. Deux cas :
--     1. Le guild est deja dans `discord_guilds` (deja linke a un tenant) →
--        l'API repond `already_linked` et le bot continue normalement.
--     2. Le guild est inconnu → l'API ne peut pas creer une row dans
--        `discord_guilds` car la FK `tenant_id` est NOT NULL — il n'y a pas
--        encore de tenant cible. On materialise donc le guild "orphelin"
--        dans cette table `pending_guild_links` en attendant qu'un admin
--        passe sur `/admin/tenants` (S7) pour :
--          - soit creer un nouveau tenant et y lier le guild,
--          - soit lier le guild a un tenant existant.
--
--   Cette table est purement transitoire (lifecycle court : minutes a
--   heures). Pas d'index ni de cleanup automatique en V1 — le volume attendu
--   est tres faible (un guild ajoute = un admin a qui notifier).
--
-- CAVEATS:
--   - PK = `guild_id` : upsert naturel sur retry du bot (idempotent).
--   - Pas de FK vers `tenants` ni `discord_guilds` (par definition, le guild
--     n'est pas encore associe).
--   - RLS enabled sans policy → service_role only. Les routes admin (S7)
--     y accederont via supabaseAdmin.
--   - `owner_discord_id` stocke a titre informatif (UX admin : "qui a invite
--     le bot ?"). Pas utilise pour de l'auth.
--   - Idempotente : peut etre re-appliquee sans erreur.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pending_guild_links (
  guild_id          text PRIMARY KEY,
  guild_name        text,
  owner_discord_id  text,
  requested_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pending_guild_links IS
  'Guilds Discord en attente de linkage a un tenant. Rempli par POST /api/bot/v1/tenants/link-guild quand le bot rejoint un guild inconnu. Vide par l''UI admin (S7) une fois le mapping etabli.';
COMMENT ON COLUMN public.pending_guild_links.guild_id IS
  'Discord snowflake (text, peut depasser 2^53). PK pour upsert idempotent.';
COMMENT ON COLUMN public.pending_guild_links.guild_name IS
  'Nom du guild au moment de l''invitation (informationnel).';
COMMENT ON COLUMN public.pending_guild_links.owner_discord_id IS
  'Discord user ID du proprietaire du guild (informationnel, aide l''admin a contacter l''opérateur).';

ALTER TABLE public.pending_guild_links ENABLE ROW LEVEL SECURITY;

COMMIT;

-- PostgREST schema cache reload (nouvelle table).
NOTIFY pgrst, 'reload schema';
