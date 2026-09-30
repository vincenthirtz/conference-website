-- supabase/migrations/20260930150000_public_mvp_overlay_settings.sql
--
-- APPLIQUÉE en production le 2026-09-30 (projet `owwomenscup`). Rejouée par
--     `supabase start` en CI (e2e). Additive et idempotente.
--
-- POURQUOI. Le sondage « coup de cœur du public » (match_public_mvp_polls)
--   s'affiche dans la source OBS `/overlay/regie`, mais rien ne se réglait :
--   durée du vote figée à 10 min, carte toujours en haut, et aucun moyen de
--   VOIR le visuel avant le direct. Admin › Diffusion › Overlays porte
--   désormais ce réglage, par espace (les sources OBS sont par espace).
--
-- UNE LIGNE PAR ESPACE, créée au premier enregistrement ; absente = défauts.
--   `demo_until` : un TEST est à l'écran jusqu'à cette heure — la source affiche
--   un faux vote animé, marqué « TEST », sans toucher aux vraies voix. Un vrai
--   vote ouvert passe toujours devant.
--
-- CAVEATS:
--   - RLS activée, service role uniquement (lue par /api/overlay/*, écrite par
--     /api/admin/diffusion/mvp-overlay).
--   - Rollback : DROP TABLE public.public_mvp_overlay_settings.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_mvp_overlay_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  window_minutes integer NOT NULL DEFAULT 10
    CHECK (window_minutes BETWEEN 1 AND 360),
  position text NOT NULL DEFAULT 'top'
    CHECK (position IN ('top', 'center', 'bottom')),
  show_sources boolean NOT NULL DEFAULT true,
  demo_started_at timestamptz,
  demo_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.public_mvp_overlay_settings IS
  'Réglages du sondage MVP du public dans la source OBS /overlay/regie (durée, position, test en cours) — Admin › Diffusion › Overlays.';

ALTER TABLE public.public_mvp_overlay_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_mvp_overlay_settings_service_role
  ON public.public_mvp_overlay_settings;
CREATE POLICY public_mvp_overlay_settings_service_role
  ON public.public_mvp_overlay_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
