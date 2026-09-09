-- database/migrations/add_event_segments_obs_scene.sql
--
-- Ajoute `event_segments.obs_scene` : le nom de la scène OBS à mettre à
-- l'antenne quand ce segment démarre.
--
-- Avant : la régie (/admin/regie) enchaînait les segments sans rien dire à
-- OBS ; il fallait cliquer la scène à la main dans OBS en parallèle, au
-- moment précis d'une transition. Le cockpit /admin/caster savait déjà piloter
-- OBS (utils/caster/obsClient + le hook useObs), mais rien ne reliait cette
-- capacité au déroulé du show.
--
-- Maintenant : chaque segment peut porter le nom d'une scène OBS. La régie,
-- connectée à l'OBS de la machine de casting, bascule dessus au démarrage du
-- segment. NULL ou chaîne vide = aucune bascule (comportement historique).
--
-- On stocke le NOM de la scène, pas un identifiant : obs-websocket adresse les
-- scènes par nom, et le nom est ce que l'opérateur voit dans OBS. Contrepartie
-- assumée : renommer une scène dans OBS casse le lien, silencieusement — la
-- régie journalise alors un échec de bascule sans interrompre le segment.
--
-- Idempotent. Aucune FK, aucune contrainte : OBS n'est pas dans cette base et
-- rien ici ne peut valider qu'une scène existe.

ALTER TABLE public.event_segments
  ADD COLUMN IF NOT EXISTS obs_scene text;

COMMENT ON COLUMN public.event_segments.obs_scene IS
  'Nom de la scène OBS à mettre à l''antenne au démarrage du segment. NULL = pas de bascule automatique. Le nom est celui affiché dans OBS (obs-websocket adresse par nom).';
