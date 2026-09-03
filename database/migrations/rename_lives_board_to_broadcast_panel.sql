-- `lives_board_channel_id` → `broadcast_panel_channel_id`.
--
-- La colonne servait DEUX modules du bot :
--   1. le « lives board », un message Twitch auto-rafraîchi — supprimé, il
--      faisait doublon avec live-announcer.js (annonce des lives des
--      ambassadrices) qui, lui, notifie vraiment ;
--   2. le panneau « on-air » de la régie (broadcast-events.js), qui reste.
--
-- Le partage était un piège : vider la clé pour taire le board éteignait aussi
-- le panneau de régie, sans un mot. La colonne appartient désormais au seul
-- module qui s'en sert, et son nom le dit.
--
-- RENOMMAGE et non suppression : la valeur éventuelle d'un tenant est
-- conservée. Ici elle est déjà NULL — le board avait été débranché après avoir
-- écrasé un message de scrim dans le même salon.

ALTER TABLE public.tenant_discord_config
  RENAME COLUMN lives_board_channel_id TO broadcast_panel_channel_id;

COMMENT ON COLUMN public.tenant_discord_config.broadcast_panel_channel_id IS
  'Salon où le bot maintient le panneau « on-air » de la régie (broadcast-events.js). NULL = panneau désactivé.';

NOTIFY pgrst, 'reload schema';
