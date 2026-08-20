// utils/teams/rosterReadiness.ts
//
// « Qui, dans ce roster, n'est pas encore joignable sur Discord ? »
//
// La santé d'équipe (utils/teams/teamHealth.ts) répond déjà « combien » — mais
// un capitaine qui lit « 3 comptes Discord non liés » sur son tableau de bord
// ne sait pas à qui écrire, et le compte reste donc à 3. Ces sélecteurs
// servent la même donnée là où elle devient actionnable : sur la liste des
// membres, ligne par ligne.
//
// Le point délicat est le TROISIÈME état. `discord_linked` vaut `true`,
// `false`… ou `null` quand le serveur ne l'a pas communiqué (l'appelant ne
// gère pas l'équipe, cf. utils/teams/managedTeamSlice.ts). Confondre `null`
// avec `false` afficherait « personne n'a lié son Discord » à une joueuse
// ordinaire — un faux constat, et une donnée qu'elle n'est pas censée lire.
// D'où deux fonctions plutôt qu'un `filter` en ligne : l'une compte les
// manquants CONNUS, l'autre dit si l'on sait quoi que ce soit.

/** Le strict nécessaire : le champ tri-état exposé par la tranche équipe. */
export type RosterReadinessMemberLike = {
  discord_linked?: boolean | null;
};

/**
 * `true` dès qu'une ligne porte un état de liaison exploitable. Une liste
 * entièrement `null` (ou vide) veut dire « on ne sait pas » : l'écran ne doit
 * alors rien afficher, ni constat ni rassurance.
 */
export function hasDiscordLinkInfo(
  members: readonly RosterReadinessMemberLike[]
): boolean {
  return members.some((m) => typeof m.discord_linked === 'boolean');
}

/**
 * Nombre de membres dont on SAIT que le compte Discord n'est pas lié. Les
 * `null` ne comptent pas : ne pas savoir n'est pas un manque constaté.
 */
export function countDiscordUnlinked(
  members: readonly RosterReadinessMemberLike[]
): number {
  return members.filter((m) => m.discord_linked === false).length;
}

/**
 * Le couple à afficher : combien manquent, sur combien de membres dont on
 * connaît l'état. Le dénominateur est CELUI DES LIGNES CONNUES, pas la taille
 * du roster — sinon « 3 sur 7 » mentirait dès qu'une ligne est indéterminée.
 */
export function discordReadinessSummary(
  members: readonly RosterReadinessMemberLike[]
): { unlinked: number; known: number } {
  const known = members.filter(
    (m) => typeof m.discord_linked === 'boolean'
  ).length;
  return { unlinked: countDiscordUnlinked(members), known };
}
