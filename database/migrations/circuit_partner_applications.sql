-- Migration : candidatures à l'offre partenaire des circuits féminins et mixtes.
-- Date: 2026-09-16
--
-- WHY:
--   La page `/organisateurs/circuits-feminins` propose aux circuits féminins et
--   mixtes (tous les jeux du registre `config/games`) un plan offert pour une
--   saison (`config/circuitPartnerOffer.ts`). Une candidature arrive par
--   `POST /api/circuit-partners/apply` ; le staff de plateforme la retient ou
--   la refuse depuis l'admin (`/api/admin/circuit-partners/[id]`), et l'accord
--   pose le plan sur l'espace désigné.
--
-- POURQUOI PAS `partnership_requests`. Cette table sert aux SPONSORS
--   (catégorie, budget) : une candidature de circuit n'a ni l'un ni l'autre,
--   mais un jeu, un format, un nombre d'équipes, des engagements de sécurité
--   et, une fois retenue, un espace et une échéance. Les ranger dans `message`
--   aurait rendu l'accord impossible à tracer.
--
-- L'ACCORD EST TRACÉ SUR LA CANDIDATURE : `granted_tenant_id`, `granted_plan`,
--   `granted_until`, `decided_by`, `decided_at`. Le plan lui-même vit sur
--   `tenants` ; ces colonnes disent POURQUOI il y est. Une candidature retenue
--   sans espace est refusée par le CHECK `circuit_partner_approved_has_grant`.
--
-- LE JEU N'EST PAS UN CHECK. La liste vit dans le registre `config/games`, que
--   la route valide (`isGameSlug`) : un CHECK en base obligerait une migration
--   à chaque jeu ajouté, pour une table qui ne pilote aucun comportement de jeu.
--
-- CAVEATS:
--   - Additive et idempotente (IF NOT EXISTS, DROP POLICY IF EXISTS).
--   - RLS activée, lecture et écriture réservées au service role : les routes
--     passent par `supabaseAdmin`, jamais par le client navigateur.
--   - Rollback : DROP TABLE public.circuit_partner_applications (aucune autre
--     table ne la référence ; les plans accordés restent sur `tenants`).
--   - APPLIQUÉE en production le 2026-09-16.

BEGIN;

CREATE TABLE IF NOT EXISTS public.circuit_partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  organization_name text NOT NULL CHECK (char_length(organization_name) BETWEEN 1 AND 200),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 200),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  game text NOT NULL CHECK (char_length(game) BETWEEN 1 AND 50),
  format text NOT NULL CHECK (format IN ('feminin', 'mixte')),
  season_start date,
  expected_teams integer CHECK (expected_teams IS NULL OR expected_teams BETWEEN 2 AND 512),
  website text CHECK (website IS NULL OR char_length(website) <= 500),
  community_url text CHECK (community_url IS NULL OR char_length(community_url) <= 500),
  -- Slug d'un espace déjà créé sur la plateforme, s'il existe.
  existing_tenant_slug text CHECK (existing_tenant_slug IS NULL OR char_length(existing_tenant_slug) <= 100),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 3000),
  -- Engagements cochés au dépôt. La route exige les deux à vrai.
  commits_code_of_conduct boolean NOT NULL,
  commits_safety_lead boolean NOT NULL,

  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'approved', 'rejected')),
  admin_notes text CHECK (admin_notes IS NULL OR char_length(admin_notes) <= 3000),

  granted_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  granted_plan text,
  granted_until timestamptz,
  decided_by uuid,
  decided_at timestamptz,

  ip_address text,
  user_agent text,

  CONSTRAINT circuit_partner_approved_has_grant CHECK (
    status <> 'approved'
    OR (granted_plan IS NOT NULL AND granted_until IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_circuit_partner_applications_status
  ON public.circuit_partner_applications (status, created_at DESC);

ALTER TABLE public.circuit_partner_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS circuit_partner_applications_service_role
  ON public.circuit_partner_applications;
CREATE POLICY circuit_partner_applications_service_role
  ON public.circuit_partner_applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
