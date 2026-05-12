-- Migration: User <-> Discord identity mapping
-- Date: 2026-05-12
--
-- Permet au bot Discord d'envoyer des DM aux utilisateurs du site
-- (capitaines, casters) en associant leur auth_user_id Supabase a leur
-- Discord snowflake. Alimenté automatiquement quand un user se connecte
-- via le provider Discord (cf. pages/auth/discord-member.tsx).

CREATE TABLE IF NOT EXISTS user_discord_links (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id text NOT NULL UNIQUE,
  discord_username text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_discord_links_discord_user_id_idx
  ON user_discord_links (discord_user_id);

COMMENT ON TABLE user_discord_links IS
  'Mapping auth.users <-> Discord snowflake pour permettre les DM bot.';
COMMENT ON COLUMN user_discord_links.discord_user_id IS
  'Discord snowflake (string, 15-25 digits). UNIQUE pour empecher 2 users de squatter le meme Discord.';
COMMENT ON COLUMN user_discord_links.discord_username IS
  'Username Discord lisible au moment du link (snapshot, pas synchronise).';
