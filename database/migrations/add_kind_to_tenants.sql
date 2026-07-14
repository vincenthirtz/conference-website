-- Migration: tenant kind (organisateur vs développeur)
--
-- WHY: l'inscription self-service crée deux natures de tenants distinctes qui
--   partagent la même table mais n'ont pas la même finalité :
--     - 'organizer' : une régie/organisation qui gère des tournois, sa vitrine
--                     white-label, ses équipes, son Discord (le cas historique).
--     - 'developer' : un compte API self-service, créé uniquement pour obtenir
--                     des clés et consommer l'API publique — pas de vitrine ni
--                     d'ops tournoi. Sert à filtrer l'UI et à cadrer les
--                     entitlements côté portail développeur.
--
-- WHAT (additif, non-destructif) :
--   - kind : nature du tenant. Défaut 'organizer' => tous les tenants existants
--            restent organisateurs sans backfill (le DEFAULT s'en charge).
--
--   Aucun UPDATE nécessaire : le seul cas nouveau ('developer') est posé à la
--   création par le flux d'inscription développeur. Pas de reload de cache
--   PostgREST (pas de FK ajoutée).

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'organizer';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_kind_check') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_kind_check
      CHECK (kind IN ('organizer','developer'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.kind IS
  'Nature du tenant : ''organizer'' (régie/organisation avec vitrine et ops tournoi) ou ''developer'' (compte API self-service). Défaut ''organizer''.';

COMMIT;
