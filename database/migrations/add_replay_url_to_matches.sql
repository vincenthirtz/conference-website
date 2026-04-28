-- Migration: replay/VOD URL par match
-- Date: 2026-04-28
--
-- Ajoute une colonne replay_url sur matches pour permettre au caster de coller
-- le lien VOD post-match (YouTube, Twitch highlight, etc.) et l'afficher
-- publiquement sur la page match.
--
-- Aujourd'hui, config/replays.ts liste des replays YouTube en statique sans
-- lien explicite avec un match. Cette colonne permet une association directe.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS replay_url text;

COMMENT ON COLUMN matches.replay_url IS
  'URL du replay/VOD du match (YouTube, Twitch highlight, etc.) — saisie post-match par le caster.';
