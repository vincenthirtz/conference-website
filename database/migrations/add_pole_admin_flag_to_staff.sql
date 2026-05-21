-- Migration: staff.is_pole_admin (cross-tenant staff)
--
-- Description : Ajoute le flag is_pole_admin sur staff. Un staff dont
-- is_pole_admin=true a accès à TOUS les tenants sans passer par la table
-- tenant_staff (qui scope l'accès tenant-par-tenant). Cible : membres du
-- pôle dirigeant / lead-tech qui doivent pouvoir naviguer cross-tenant sans
-- friction cookie-switcher.
--
-- Pourquoi un boolean sur staff plutôt qu'un role 'pole_admin' dans
-- tenant_staff ?
--   - tenant_staff.role décrit le rôle DANS UN tenant ; pole_admin est
--     transverse, il n'appartient à aucun tenant.
--   - éviter de dupliquer N rows tenant_staff par staff cross-tenant.
--   - permet aux helpers canAccessTenant() / listAccessibleTenants()
--     d'early-return sans JOIN sur tenant_staff.
--
-- Sécurité : le flag reste sur staff, qui est déjà service-role-only via RLS
-- baseline (pas de policy externe). Aucune nouvelle exposition publique.
--
-- Pas d'impact PostgREST embeds (aucune FK ajoutée), mais on NOTIFY par
-- prudence pour rafraîchir le schema cache après l'ALTER COLUMN.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_pole_admin BOOLEAN NOT NULL DEFAULT false;

-- Index partiel : la grande majorité des staff aura is_pole_admin=false,
-- seul un poignée de rows est ciblée par les lookups "qui est pole admin ?".
CREATE INDEX IF NOT EXISTS idx_staff_is_pole_admin
  ON public.staff (is_pole_admin)
  WHERE is_pole_admin = true;

COMMENT ON COLUMN public.staff.is_pole_admin IS
  'Flag cross-tenant. true = ce staff a accès à TOUS les tenants sans passer par tenant_staff. Géré uniquement via interface lead-tech.';

NOTIFY pgrst, 'reload schema';
