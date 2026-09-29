-- database/migrations/20260929_demote_developer_global_owner.sql
--
-- ⚠️  NON APPLIQUÉE. À relire, puis à appliquer À LA MAIN (projet `owwomenscup`),
--     APRÈS le déploiement du correctif de code (inscription développeur en
--     `caster` global + `/api/admin/me` qui rend le rôle effectif). Idempotente :
--     la rejouer ne change plus rien.
--
-- POURQUOI. `POST /api/developers/register` (inscription anonyme, auto-approuvée)
-- créait un staff `role = 'owner'` GLOBAL, en plus de `tenant_staff.role = 'owner'`
-- sur son espace `kind = 'developer'`. Le rôle global est celui que lisent les
-- gardes de PLATEFORME (`scope: 'platform'`) : n'importe quel inconnu passait
-- donc la supervision des espaces, la file d'onboarding, les clés d'API d'un
-- espace tiers, etc. Le code n'en crée plus (rôle global `caster`) ; cette
-- migration rétrograde les comptes déjà créés.
--
-- PÉRIMÈTRE, volontairement étroit :
--   - staff `role = 'owner'` ;
--   - NON pôle-admin (`is_pole_admin` faux ou nul) ;
--   - rattaché à AU MOINS un espace, et TOUS ses espaces sont `kind = 'developer'`.
-- Un owner qui a le moindre espace organisateur, ou aucun rattachement (compte
-- plateforme historique), n'est PAS touché.
--
-- Ce que le compte garde : `tenant_staff.role = 'owner'` sur son espace, qui élève
-- son rôle effectif sur l'espace actif — la console développeur (facturation,
-- clés, webhooks) fonctionne à l'identique.
--
-- Vérifier AVANT d'appliquer (liste des comptes visés) :
--
--   SELECT s.id, s.email, s.role, s.is_pole_admin
--   FROM staff s
--   WHERE s.role = 'owner'
--     AND COALESCE(s.is_pole_admin, false) = false
--     AND EXISTS (SELECT 1 FROM tenant_staff ts WHERE ts.staff_id = s.id)
--     AND NOT EXISTS (
--       SELECT 1
--       FROM tenant_staff ts
--       JOIN tenants t ON t.id = ts.tenant_id
--       WHERE ts.staff_id = s.id
--         AND COALESCE(t.kind, 'organizer') <> 'developer'
--     );

BEGIN;

UPDATE staff s
SET role = 'caster'
WHERE s.role = 'owner'
  AND COALESCE(s.is_pole_admin, false) = false
  AND EXISTS (SELECT 1 FROM tenant_staff ts WHERE ts.staff_id = s.id)
  AND NOT EXISTS (
    SELECT 1
    FROM tenant_staff ts
    JOIN tenants t ON t.id = ts.tenant_id
    WHERE ts.staff_id = s.id
      AND COALESCE(t.kind, 'organizer') <> 'developer'
  );

COMMIT;

-- Après application : le cache staff applicatif (5 min) et le cache de rôle
-- par espace (`readTenantStaffRole`) expirent seuls ; aucun redéploiement requis.
