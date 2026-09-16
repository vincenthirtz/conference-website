// utils/billing/trial.ts
//
// Essai gratuit ouvert à la CRÉATION d'un espace, quel que soit le chemin.
//
// Pourquoi il existe. `tenants.plan` vaut `discovery` par défaut. Ce palier a
// gagné le bot Discord le 2026-09-16, mais pas l'arbitrage outillé, le
// classement, la production live, la marque blanche ni l'API : l'essai sert
// désormais à faire essayer CELA, trente jours, plutôt qu'à éviter un bot muet.
// Sans lui, un espace découvrirait ce qui lui manque en le heurtant.
//
// Pourquoi ici. Deux chemins créent un espace — l'auto-claim de l'onboarding
// self-service et la création par le staff depuis le back-office — et ils
// doivent produire le même résultat. La première version ne traitait que le
// premier : un espace ouvert à la main par le staff naissait muet.
//
// Y COMPRIS pour les espaces `kind = developer` (cf. pages/api/developers/register.ts),
// contrairement à ce que ce fichier a longtemps dit. L'exclusion se justifiait
// par le bot — un développeur ne vient pas animer un tournoi. Mais `regie` est
// aussi le premier palier qui ouvre `apiRead`, c'est-à-dire exactement ce qu'un
// espace développeur vient chercher : les exclure revenait à leur faire générer
// des clés qui répondaient 403 à chaque appel. L'essai ne leur promet pas le
// bot, il leur donne trente jours d'API.
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
