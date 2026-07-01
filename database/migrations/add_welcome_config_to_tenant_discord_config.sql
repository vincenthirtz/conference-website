-- Migration: ajoute la config « accueil des nouveaux arrivants » sur
--            `tenant_discord_config` (4 colonnes, cohérence avec les colonnes
--            existantes — PAS dans `extras`).
-- Date: 2026-07-01
--
-- WHY:
--   Le bot Discord doit pouvoir accueillir les nouveaux membres par serveur
--   (message dans un salon + DM optionnel). Cette config est éditée par
--   l'admin via la page site (PUT /api/admin/tenants/[id]/discord-config/
--   [guildId]) et lue par le bot via GET /api/bot/v1/tenants/all-configs
--   (et /by-guild/:id). On la stocke en colonnes typées, comme les autres
--   channels/roles, plutôt que dans le blob `extras`.
--
-- WHAT:
--   1. ADD COLUMN welcome_enabled     boolean NOT NULL DEFAULT false
--   2. ADD COLUMN welcome_channel_id  text    (nullable — snowflake du salon)
--   3. ADD COLUMN welcome_message     text    (nullable — message in-channel)
--   4. ADD COLUMN welcome_dm_message  text    (nullable — DM optionnel)
--
-- CAVEATS:
--   - Idempotente : guards ADD COLUMN IF NOT EXISTS.
--   - Aucune perte de données : ajout pur. `welcome_enabled` NOT NULL DEFAULT
--     false → les rows existantes reçoivent `false` automatiquement.
--   - `welcome_channel_id` est un snowflake Discord validé côté site (chaîne
--     de chiffres OU vide → NULL). Pas de contrainte FK → pas de reload de
--     schema-cache requis pour les FK, mais on émet quand même le NOTIFY
--     PostgREST standard suite à l'ADD COLUMN (nouvelles colonnes exposées).
--
-- POSTGREST:
--   ADD COLUMN -> reload schema cache (NOTIFY pgrst en fin).

BEGIN;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS welcome_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS welcome_channel_id text;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS welcome_message text;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS welcome_dm_message text;

COMMENT ON COLUMN public.tenant_discord_config.welcome_enabled IS
  'Active l''accueil des nouveaux arrivants pour ce guild. false = le bot n''envoie rien.';
COMMENT ON COLUMN public.tenant_discord_config.welcome_channel_id IS
  'Snowflake Discord du salon où poster le message d''accueil. NULL = pas de message in-channel.';
COMMENT ON COLUMN public.tenant_discord_config.welcome_message IS
  'Gabarit du message d''accueil posté dans welcome_channel_id. NULL = pas de message in-channel.';
COMMENT ON COLUMN public.tenant_discord_config.welcome_dm_message IS
  'Gabarit du DM optionnel envoyé au nouvel arrivant. NULL = pas de DM.';

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload (nouvelles colonnes exposées via l'API REST)
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
