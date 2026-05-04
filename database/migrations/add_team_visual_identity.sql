-- Migration: Extend team public page visual identity
-- Date: 2026-05-04
--
-- Adds extra customization columns on `teams`:
--   - `secondary_color`  : optional second hex color, used to build gradients
--                          and accents alongside `accent_color`
--   - `banner_overlay`   : style of the layer drawn over the banner image
--                          ('gradient' default, 'dark', 'none', 'grid', 'dots')
--   - `banner_focal`     : focal point of the banner image, mapped to CSS
--                          object-position ('center', 'top', 'bottom', 'left',
--                          'right')
--   - `youtube`          : handle or URL
--   - `twitch`           : handle or URL
--   - `instagram`        : handle or URL
--   - `tiktok`           : handle or URL

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS banner_overlay text,
  ADD COLUMN IF NOT EXISTS banner_focal text,
  ADD COLUMN IF NOT EXISTS youtube text,
  ADD COLUMN IF NOT EXISTS twitch text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS tiktok text;

COMMENT ON COLUMN teams.secondary_color IS 'Optional secondary hex color (#rgb or #rrggbb). Used with accent_color to build gradients.';
COMMENT ON COLUMN teams.banner_overlay IS 'Overlay style above the banner image. One of: gradient (default), dark, none, grid, dots.';
COMMENT ON COLUMN teams.banner_focal IS 'Banner focal point mapped to object-position. One of: center (default), top, bottom, left, right.';
COMMENT ON COLUMN teams.youtube IS 'YouTube handle or URL displayed on the public team page.';
COMMENT ON COLUMN teams.twitch IS 'Twitch handle or URL displayed on the public team page.';
COMMENT ON COLUMN teams.instagram IS 'Instagram handle or URL displayed on the public team page.';
COMMENT ON COLUMN teams.tiktok IS 'TikTok handle or URL displayed on the public team page.';
