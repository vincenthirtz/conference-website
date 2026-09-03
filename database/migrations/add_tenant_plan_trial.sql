-- Essai gratuit à la création d'un tenant self-service.
--
-- Le problème. `tenants.plan` vaut `discovery` par défaut, et `discovery`
-- n'ouvre PAS le bot Discord (cf. utils/billing/planFeatures.ts) : le gate
-- baseline de `withBotRoute` répond 403 sur toute route tenant-scopée. Or
-- l'onboarding self-service consiste précisément à faire installer le bot.
-- Un tenant fraîchement créé recevait donc un bot muet, sans que rien ne le
-- dise.
--
-- Le choix. L'auto-claim pose un essai de 30 jours en `regie` : le bot marche
-- immédiatement, puis le cron `plan-renewal` bascule en `past_due` à
-- l'échéance et `effectivePlan()` retombe seul sur `discovery`. Le paywall
-- reste entier — on déplace juste le moment où il mord.
--
-- La colonne sert à ne pas confondre un essai avec un abonnement payé :
-- la relance d'échéance parle alors de fin d'essai, pas de renouvellement,
-- et l'UI de facturation peut l'afficher comme tel. Elle est remise à false
-- au premier paiement (cf. applyTenantPlanPayment).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan_is_trial boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.plan_is_trial IS
  'true = le plan courant est un essai gratuit (onboarding self-service), jamais payé. Remis à false au premier paiement.';

NOTIFY pgrst, 'reload schema';
