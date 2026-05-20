-- Migration: enable RLS on the last six public-schema tables still bypassing it
--
-- WHY:
--   Supabase's linter rule 0013 (rls_disabled_in_public) flagged six tables
--   that are reachable via PostgREST but have RLS disabled — meaning any anon
--   or authenticated key can read/write them directly. All our API routes go
--   through `supabaseAdmin` (service_role bypasses RLS) so enabling RLS does
--   NOT break our server-side handlers; it only closes the direct-API hole.
--
-- WHAT:
--   - adherents, adherent_payments, partnership_requests, match_map_vetos:
--     service-role-only — enable RLS with NO policies (same pattern as
--     enable_rls_baseline_tables.sql).
--   - site_settings, partners: public read is the intended behavior (feature
--     flags, partners page). Enable RLS + a narrow SELECT policy for anon
--     and authenticated. Writes go through supabaseAdmin.
--
-- CAVEATS:
--   The public read of site_settings exposes ALL rows. If any row holds a
--   secret value, gate it behind a `WHERE` in the API or split into a
--   service-role-only table. Today the table holds feature flags and the
--   bot maintenance flag — both intended-public.

BEGIN;

-- Service-role-only tables (no policies) -----------------------------------
ALTER TABLE public.adherents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherent_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_map_vetos       ENABLE ROW LEVEL SECURITY;

-- Public-read tables -------------------------------------------------------
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_settings_select_public ON public.site_settings;
CREATE POLICY site_settings_select_public
  ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partners_select_public ON public.partners;
CREATE POLICY partners_select_public
  ON public.partners
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
