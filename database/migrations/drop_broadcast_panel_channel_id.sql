-- Suppression de `broadcast_panel_channel_id`.
--
-- La colonne pilotait le panneau « on-air » que le bot maintenait dans un salon
-- Discord (broadcast-events.js), miroir de l'état de la régie. Ce panneau est
-- supprimé : la régie se pilote sur le site et se regarde dans l'overlay OBS,
-- le miroir Discord n'apportait rien que personne ne consultait.
--
-- La colonne était déjà NULL, et elle ne l'a jamais été autrement que pointée
-- sur le salon d'actions du bot — où elle n'avait rien à faire.
--
-- Ce qui RESTE de la régie : l'event `broadcast.state_changed` continue d'être
-- émis et journalisé (trace d'un changement d'état en direct), la console
-- /admin/regie, l'overlay /overlay/[runId] et l'auto-director sont intacts.

ALTER TABLE public.tenant_discord_config
  DROP COLUMN IF EXISTS broadcast_panel_channel_id;

NOTIFY pgrst, 'reload schema';
