-- Migration: Ajouter discord_role_id sur teams pour les pings auto
-- Date: 2026-04-28
--
-- Permet de stocker l'ID du role Discord associe a une equipe, pour que les
-- notifications de match (J-15min, resultats) pingent le bon role
-- ("@lenomdelequipe") via la syntaxe Discord <@&ROLE_ID>.

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS discord_role_id text DEFAULT NULL;

COMMENT ON COLUMN teams.discord_role_id IS 'ID du role Discord de l''equipe (sans <@&>), utilise pour les pings de notification de match.';
