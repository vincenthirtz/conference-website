-- Migration: exemption « partenaire » par clé sur `tenant_api_tokens`
-- Date: 2026-07-09
--
-- WHY:
--   Modèle éco « Régie solidaire » — le gate PLAN (utils/billing/apiPlanGate.ts)
--   réserve l'accès API (lecture/écriture) aux plans payants. On veut pouvoir
--   offrir GRATUITEMENT l'accès à une clé précise (partenaire, sponsor, projet
--   ami) SANS faire basculer tout le tenant sur un plan payant.
--
--   Granularité = la CLÉ, pas le tenant : un tenant `discovery` peut porter une
--   clé `comp = true` (accès complet) à côté de clés normales (gatées). C'est
--   l'opérateur plateforme qui pose ce flag (rôle owner requis côté admin API) —
--   ce n'est PAS un self-service qui viderait le modèle payant.
--
-- WHAT:
--   - `comp` boolean NOT NULL DEFAULT false : true → la clé BYPASSE entièrement
--     le gate de plan (read + write accordés quel que soit le plan du tenant,
--     y compris `discovery` / plan expiré).
--   - `comp_note` text (nullable) : trace libre du partenaire / de la raison de
--     l'exemption (audit humain — « Sponsor OBS overlay », « Assos amie », …).
--
-- SÉCURITÉ:
--   Le bypass est TOTAL : une clé comp ignore l'entitlement facturé. À réserver
--   à l'opérateur plateforme. Côté admin API, poser/retirer `comp=true` exige le
--   rôle `owner` (cf. pages/api/admin/api-tokens/*).
--
-- CAVEATS:
--   - Idempotente : `ADD COLUMN IF NOT EXISTS`.
--   - Aucune donnée existante affectée (DEFAULT false → clés actuelles gatées
--     normalement).

BEGIN;

ALTER TABLE public.tenant_api_tokens
  ADD COLUMN IF NOT EXISTS comp boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenant_api_tokens
  ADD COLUMN IF NOT EXISTS comp_note text;

COMMENT ON COLUMN public.tenant_api_tokens.comp IS
  'Exemption partenaire : true → cette clé bypasse le gate de plan (accès API '
  'gratuit en lecture ET écriture, quel que soit le plan du tenant). Posé par '
  'l''opérateur plateforme (owner).';
COMMENT ON COLUMN public.tenant_api_tokens.comp_note IS
  'Note libre traçant le partenaire / la raison de l''exemption comp.';

COMMIT;

-- PostgREST : reload du cache de schéma pour exposer les nouvelles colonnes.
NOTIFY pgrst, 'reload schema';
