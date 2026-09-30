-- supabase/migrations/20260930170000_regie_overlay_layouts.sql
--
-- APPLIQUÉE en production le 2026-09-30 (projet `owwomenscup`). Rejouée par
--     `supabase start` en CI (e2e). Additive et idempotente.
--
-- POURQUOI. La source OBS `/overlay/regie` passe en plein écran : chaque
--   élément (alertes, sondage MVP, bandeau partenaires, QR de don) doit pouvoir
--   se placer là où la scène le veut, sans recadrer la source dans OBS.
--   Admin › Diffusion › Overlays règle cette mise en page, par espace.
--
-- UNE LIGNE PAR ESPACE, `layout` en JSON : { alerts|mvp|partners|don:
--   { anchor, x, y, scale, visible } } — forme et bornes dans
--   utils/overlay/regieLayout.ts (normalizeRegieLayout). Absente ou partielle =
--   la mise en page d'origine, élément par élément.
--
-- CAVEATS:
--   - RLS activée, service role uniquement (lue par /api/overlay/alerts,
--     écrite par /api/admin/diffusion/regie-layout).
--   - Rollback : DROP TABLE public.regie_overlay_layouts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.regie_overlay_layouts (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(layout) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.regie_overlay_layouts IS
  'Mise en page de la source OBS /overlay/regie (ancrage, décalage, échelle, visibilité de chaque élément) — Admin › Diffusion › Overlays.';

ALTER TABLE public.regie_overlay_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regie_overlay_layouts_service_role
  ON public.regie_overlay_layouts;
CREATE POLICY regie_overlay_layouts_service_role
  ON public.regie_overlay_layouts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
