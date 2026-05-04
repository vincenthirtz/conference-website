-- Migration: Optional rich sections on team public page
-- Date: 2026-05-04
--
-- Adds four optional sections that captains/managers can fill in from their
-- team edit page:
--   - achievements          : JSONB array of {title, date, tournament}
--   - sponsors              : JSONB array of {name, logo_url, url}
--   - embed_provider        : 'youtube' | 'twitch' | null
--   - embed_id              : video id or channel name (null when no embed)
--   - pinned_announcement   : short banner text (null/empty = hidden)
--   - pinned_announcement_until : optional expiry timestamp; when in the past
--                                  the banner is hidden automatically
--
-- Visibility ("toggleable") is implicit: a section is rendered iff its content
-- is non-empty. The expiry on pinned announcements lets temporary banners hide
-- themselves without a manual edit.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS achievements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sponsors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS embed_provider text,
  ADD COLUMN IF NOT EXISTS embed_id text,
  ADD COLUMN IF NOT EXISTS pinned_announcement text,
  ADD COLUMN IF NOT EXISTS pinned_announcement_until timestamptz;

COMMENT ON COLUMN teams.achievements IS 'JSONB array of {title, date, tournament} entries shown on the public page. Capped at 12 server-side.';
COMMENT ON COLUMN teams.sponsors IS 'JSONB array of {name, logo_url, url} entries shown on the public page. Capped at 8 server-side.';
COMMENT ON COLUMN teams.embed_provider IS 'Embed provider: ''youtube'' or ''twitch''. Null when no live embed is configured.';
COMMENT ON COLUMN teams.embed_id IS 'Identifier for the embed: YouTube video id or Twitch channel name.';
COMMENT ON COLUMN teams.pinned_announcement IS 'Short text shown as a pinned banner at the top of the public page (e.g. ''We are recruiting!'').';
COMMENT ON COLUMN teams.pinned_announcement_until IS 'Optional expiry for the pinned announcement. When set and in the past, the banner is hidden.';
