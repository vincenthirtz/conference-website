// components/Association/ribbit.ts
//
// Coordonnées du partenaire qui fournit le staff d'arbitrage du tournoi.
// Extraites de la page pour la même raison que `components/Production/pogtv` :
// si l'encart est repris ailleurs (page /partenaires, bandeau tournoi), un
// seul endroit à mettre à jour.
//
// Le logo est servi en local : une URL distante casse `next/image`
// (remotePatterns), comme pour POGTV et les logos d'équipes.

export const RIBBIT_NAME = 'Ribbit';
export const RIBBIT_LOGO = '/img/logos/ribbit.svg';
/** `null` tant que le partenaire n'a pas fourni d'URL publique. */
export const RIBBIT_URL: string | null = null;
