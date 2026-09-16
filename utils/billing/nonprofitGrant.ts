// utils/billing/nonprofitGrant.ts
//
// « Découverte offerte aux associations vérifiées ».
//
// Réponse directe au point de prix le plus exposé de notre grille (lot 1 du
// rapport du 15/09) : chez le concurrent, une association vérifiée sur
// HelloAsso ne paie rien ; chez nous, elle payait 100 €/an un palier sans bot
// Discord.
//
// CE QUI FAIT FOI. Pas un formulaire, pas un numéro RNA que personne n'irait
// contrôler : l'espace relie ses identifiants API HelloAsso — ce qu'il doit
// faire de toute façon pour encaisser ses propres cagnottes — et l'appel qui
// réussit EST la vérification, puisque HelloAsso n'ouvre de compte qu'à des
// organismes à but non lucratif. L'estampille (`tenants.nonprofit_verified_at`)
// est posée là, et retirée quand le compte est délié.
//
// CE QUE LA GRATUITÉ COUVRE, ET CE QU'ELLE NE COUVRE PAS : l'entrée de gamme,
// pas le catalogue. Une association vérifiée qui choisit Régie ou Circuit paie
// son plan comme tout le monde — sinon la grille n'a plus de sens, et les
// espaces qui paient financeraient les autres.
//
// Module PUR côté décision (`nonprofitDiscoveryIsFree`), pour que la règle se
// teste sans base : c'est elle qui décide si on facture quelqu'un.

import type { TenantPlan } from './planFeatures';

/**
 * Le strict nécessaire pour trancher.
 *
 * `plan` est typé `string` et non `TenantPlan` à dessein : les lignes viennent
 * de la base, où la colonne est du texte. Comparer à `'discovery'` suffit, et
 * exiger le type narrow ici obligerait chaque appelant à caster une valeur
 * qu'il n'a pas validée — un cast de confort, qui ment.
 */
export type NonprofitState = {
  plan: TenantPlan | string;
  nonprofit_verified_at?: string | null;
};

/**
 * Cet espace a-t-il droit à la Découverte offerte ?
 *
 * Deux conditions, et pas une de plus : une association vérifiée, et le palier
 * d'entrée. `foundation` n'est pas concernée (elle est déjà offerte par
 * mission), `regie`/`circuit`/`editor` non plus (ils se paient).
 */
export function nonprofitDiscoveryIsFree(state: NonprofitState): boolean {
  return state.plan === 'discovery' && Boolean(state.nonprofit_verified_at);
}

/**
 * Faut-il facturer / relancer cet espace ?
 *
 * Utilisé par le cron de renouvellement. Une association à qui l'on offre le
 * palier ne doit recevoir NI relance de paiement, NI bascule en `past_due` :
 * une relance pour une somme qu'on ne réclame pas est pire qu'un oubli, elle
 * fait douter de la promesse commerciale.
 */
export function isBillableTenant(state: NonprofitState): boolean {
  return !nonprofitDiscoveryIsFree(state);
}
