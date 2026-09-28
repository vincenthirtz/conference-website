-- Migration : le signal de présence des overlays OBS.
-- Date: 2026-09-28
--
-- WHY. Une URL d'overlay collée dans OBS ne dit jamais si elle s'affiche :
--   source masquée dans la scène, OBS fermé, URL recopiée de travers — la régie
--   ne le découvrait qu'en regardant le direct. Chaque page `/overlay/*` envoie
--   désormais un signal toutes les 30 s (`POST /api/overlay/heartbeat`), et
--   Diffusion › Overlays affiche « affichée · vue il y a 12 s » par source.
--
-- UNE LIGNE PAR (ESPACE, SOURCE), ÉCRASÉE. On ne garde pas d'historique : la
--   question est « est-ce affiché MAINTENANT ? ». Upsert sur la clé primaire.
--
-- PAS D'AUTHENTIFICATION côté overlay : les pages sont publiques et vivent
--   dans OBS, sans session. Un signal peut donc être simulé — l'impact se
--   borne à un indicateur trompeur (aucune donnée exposée), et la route est
--   limitée en débit. Le nom de source est contrôlé (motif, longueur).
--
-- CAVEATS:
--   - Additive et idempotente. RLS activée, service role uniquement.
--   - Rollback : DROP TABLE public.overlay_heartbeats.
--   - APPLIQUÉE en production le 2026-09-28.

BEGIN;

CREATE TABLE IF NOT EXISTS public.overlay_heartbeats (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source ~ '^[A-Za-z0-9:_-]{1,80}$'),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source)
);

COMMENT ON TABLE public.overlay_heartbeats IS
  'Dernier signal de présence de chaque overlay OBS, par espace et par source (Diffusion › Overlays).';

ALTER TABLE public.overlay_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS overlay_heartbeats_service_role ON public.overlay_heartbeats;
CREATE POLICY overlay_heartbeats_service_role ON public.overlay_heartbeats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
