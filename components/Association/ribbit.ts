// components/Association/ribbit.ts
//
// Coordonnées du partenaire qui fournit le staff d'arbitrage du tournoi.
// Extraites de la page pour la même raison que `components/Production/pogtv` :
// si l'encart est repris ailleurs (page /partenaires, bandeau tournoi), un
// seul endroit à mettre à jour.
//
// Le logo est servi en local : une URL distante casse `next/image`
// (remotePatterns), comme pour POGTV et les logos d'équipes.

export const RIBBIT_NAME = 'Orange Ribbit';
export const RIBBIT_LOGO = '/img/logos/ribbit.svg';
/** Serveur Discord public du partenaire. */
export const RIBBIT_URL: string | null = 'https://discord.gg/tzJqgnTNUF';
