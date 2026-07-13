-- Migration: plan renewal reminder bookkeeping on tenants
--            (Cron « plan-renewal » — cycle de vie des abonnements self-serve)
--
-- WHY:
--   Le nouveau cron de renouvellement d'abonnement org (self-serve) fait deux
--   choses à chaque passage :
--     1. bascule en 'past_due' les plans PAYANTS dont plan_expires_at est passé ;
--     2. envoie aux owners une RELANCE de renouvellement AVANT expiration.
--   Sans mémoire d'état, l'étape 2 ré-enverrait la relance à CHAQUE run du cron
--   (spam des owners). On mémorise donc l'horodatage du dernier envoi pour ne
--   relancer qu'une fois par cycle.
--
--   Remise à NULL à chaque paiement (applyTenantPlanPayment) : le cycle repart de
--   zéro, la relance est « ré-armée » pour l'échéance suivante. NULL = jamais
--   relancé sur le cycle courant.
--
-- WHAT (additif, non-destructif) :
--   - plan_last_reminder_at : timestamptz nullable, colonne simple. Pas de NOT
--     NULL, pas de DEFAULT, pas de backfill nécessaire (NULL est l'état initial
--     correct = « aucune relance envoyée »). Ajout 100% sûr, sans verrou long.
--
--   Pas de nouvelle table, pas de FK, pas de changement RLS (public.tenants a
--   déjà ses policies). Un simple ADD COLUMN ne requiert PAS de reload du cache
--   PostgREST ; on émet NOTIFY pgrst par idiome de cohérence avec le repo.

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan_last_reminder_at timestamptz;

COMMENT ON COLUMN public.tenants.plan_last_reminder_at IS
  'Dernier envoi de relance de renouvellement de plan (cron plan-renewal). Remis à NULL à chaque paiement (applyTenantPlanPayment) pour ré-armer la relance au cycle suivant. NULL = jamais relancé ce cycle.';

COMMIT;

NOTIFY pgrst, 'reload schema';
