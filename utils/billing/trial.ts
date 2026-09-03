// utils/billing/trial.ts
//
// Essai gratuit ouvert à la CRÉATION d'un espace, quel que soit le chemin.
//
// Pourquoi il existe. `tenants.plan` vaut `discovery` par défaut, et
// `discovery` n'inclut pas le bot Discord (cf. `planFeatures.discordBot`) : le
// gate baseline de `withBotRoute` répond 403 sur toute route tenant-scopée. Un
// espace créé sans plan reçoit donc un bot installé et muet, sans que rien ne
// le signale.
//
// Pourquoi ici. Deux chemins créent un espace — l'auto-claim de l'onboarding
// self-service et la création par le staff depuis le back-office — et ils
// doivent produire le même résultat. La première version ne traitait que le
// premier : un espace ouvert à la main par le staff naissait muet.
//
// PAS pour les espaces `kind = developer` (cf. pages/api/developers/register.ts) :
// ils existent pour porter des clés d'API, pas pour animer un tournoi. Leur
// ouvrir le bot n'aurait aucun sens, et l'essai leur promettrait une capacité
// qu'ils ne demandent pas.
//
// À l'échéance, le cron `plan-renewal` repose l'espace sur `discovery` (statut
// actif, `plan_is_trial` remis à false) : la dégradation est automatique, il
// n'y a rien à révoquer à la main.

/** Plan servi pendant l'essai. Le premier palier qui inclut le bot. */
export const TRIAL_PLAN = 'regie';

/** Durée de l'essai, en jours. */
export const TRIAL_DAYS = 30;

export type TrialFields = {
  plan: string;
  plan_status: 'active';
  plan_is_trial: true;
  plan_started_at: string;
  plan_expires_at: string;
};

/**
 * Colonnes de plan à poser sur un `tenants` fraîchement créé.
 *
 * `nowMs` est injectable pour que les tests n'aient pas à composer avec
 * l'horloge.
 */
export function buildTrialFields(nowMs: number = Date.now()): TrialFields {
  return {
    plan: TRIAL_PLAN,
    plan_status: 'active',
    plan_is_trial: true,
    plan_started_at: new Date(nowMs).toISOString(),
    plan_expires_at: new Date(
      nowMs + TRIAL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString(),
  };
}
