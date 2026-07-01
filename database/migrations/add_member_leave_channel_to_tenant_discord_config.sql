-- Migration: ADD `tenant_discord_config.member_leave_channel_id`
-- Date: 2026-07-02
--
-- WHY:
--   Notifier le staff dans un salon dédié (« chan des partants ») quand un
--   membre quitte le Discord. Symétrique de `welcome_channel_id` (arrivées) :
--   les admins veulent un signal de churn (départs) sans surveiller la liste
--   des membres à la main.
--
-- WHAT:
--   1. ADD COLUMN member_leave_channel_id text (nullable, opt-in par tenant).
--
-- COMPORTEMENT BOT (member-leave.js, Events.GuildMemberRemove) :
--   - Réglé  ⇒ le bot poste un embed de départ dans ce salon.
--   - NULL   ⇒ fallback env MEMBER_LEAVE_CHANNEL_ID.
--   - Absent des deux ⇒ no-op silencieux (même convention que les autres
--     channel IDs optionnels).
--
-- Pas de FK (snowflake libre, comme les autres *_channel_id), pas de RLS à
-- toucher (table déjà en service-role only côté bot/admin).

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS member_leave_channel_id text;

COMMENT ON COLUMN public.tenant_discord_config.member_leave_channel_id IS
  'Channel où le bot notifie les départs de membres (GuildMemberRemove). Fallback env MEMBER_LEAVE_CHANNEL_ID si NULL.';
