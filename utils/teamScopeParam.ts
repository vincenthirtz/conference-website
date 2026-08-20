// utils/teamScopeParam.ts
//
// Le contrat `?teamId=`, isolé pour que LES DEUX côtés puissent l'importer.
//
// `utils/teams/teamScope.ts` (la moitié serveur) tire supabaseAdmin et la
// résolution d'accès : l'importer depuis un composant React embarquerait tout
// ça dans le bundle client. Ce module ne contient que le format de fil.
//
// POURQUOI un paramètre plutôt qu'un implicite : depuis 2026-08-20 un
// `manager` peut encadrer PLUSIEURS équipes. « Mon équipe » n'est donc plus
// une question à laquelle le serveur peut répondre seul — l'écran doit dire
// LAQUELLE. Même raisonnement, et même mécanique, que `?as=` pour
// l'inspection staff (cf. utils/subjectParam.ts) : un paramètre de requête
// traverse les ~30 routes de gestion sans qu'on ait à threader des options
// dans chaque `fetch`.
//
// Le paramètre est TOUJOURS facultatif : sans lui, le serveur retombe sur la
// première équipe gérée (comportement d'avant le multi-équipe).

/** Query param portant l'équipe ciblée par la requête. */
export const TEAM_SCOPE_QUERY_PARAM = 'teamId';

/**
 * Ajoute `?teamId=<id>` à un chemin d'API.
 *
 * No-op quand `teamId` est falsy, pour que les appelants passent la valeur du
 * contexte sans brancher :
 *
 *   fetch(withTeamParam('/api/teams/join-requests', activeTeamId))
 */
export function withTeamParam(url: string, teamId?: string | null): string {
  if (!teamId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${TEAM_SCOPE_QUERY_PARAM}=${encodeURIComponent(teamId)}`;
}
