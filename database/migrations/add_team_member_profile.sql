-- Migration: Per-member personalization on the public team page
-- Date: 2026-05-04
--
-- Adds display fields to `team_members` so each player can customize how she
-- appears on the team's public page: a display name (overrides the
-- battle_tag), a gameplay specialty (tank/dps/support/flex), avatar URL,
-- pronouns, a short tagline, and individual social handles.
--
-- All fields are optional. The display falls back to existing values
-- (battle_tag, generated initials) when a field is empty.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS twitter text,
  ADD COLUMN IF NOT EXISTS twitch text;

COMMENT ON COLUMN public.team_members.display_name IS 'Pseudo affiché publiquement; remplace le battle_tag à l''écran. NULL = on retombe sur battle_tag.';
COMMENT ON COLUMN public.team_members.specialty IS 'Spécialité de jeu : tank | dps | support | flex (NULL = non précisée).';
COMMENT ON COLUMN public.team_members.avatar_url IS 'URL http(s) d''un avatar (image carrée recommandée).';
COMMENT ON COLUMN public.team_members.pronouns IS 'Pronoms affichés sous le pseudo (ex: she/her, iel).';
COMMENT ON COLUMN public.team_members.tagline IS 'Phrase courte (max 120) décrivant le membre, affichée sur la carte publique.';
COMMENT ON COLUMN public.team_members.twitter IS 'Handle ou URL Twitter/X individuel.';
COMMENT ON COLUMN public.team_members.twitch IS 'Handle ou URL Twitch individuel.';
