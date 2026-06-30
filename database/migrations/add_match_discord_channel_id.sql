-- Migration: canal Discord prive par match (ticket T4)
--
-- Le bot Discord cree un salon texte prive dedie a chaque match (les deux
-- equipes + staff) pour la coordination avant/pendant la partie. On stocke
-- l'ID de ce salon cote site pour permettre :
--   - l'idempotence des handlers (ne pas recreer un salon si deja existant) ;
--   - le writeback bot -> site via PATCH /api/bot/v1/matches/[id]/discord ;
--   - le cleanup (delete) une fois le match termine.
--
-- Le champ est nullable : NULL = salon pas encore cree (match a venir) ou
-- supprime (match termine / nettoye).
--
-- Purement additif : aucune FK, aucun reload du schema cache PostgREST requis.
-- Suit le meme modele que add_discord_native_ux_columns.sql.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS discord_match_channel_id text DEFAULT NULL;

COMMENT ON COLUMN matches.discord_match_channel_id IS
  'ID du salon Discord texte prive cree pour ce match (NULL = pas encore cree / supprime).';
