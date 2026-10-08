// utils/stages/countedMatches.ts
// Quels matchs comptent dans un classement de phase.
//
// Un FORFAIT (`walkover`) est un match joué et tranché : le vainqueur
// (`winner_team_id`) prend la victoire, les scores stockés (ex. 2-0) comptent
// comme ceux d'un match terminé. Les classements ne gardaient que `finished` :
// une équipe qui gagnait par forfait n'avait rien, et une phase suisse refusait
// de générer la ronde suivante (« match(s) non terminés »).
//
// Un match ANNULÉ ou SUPPRIMÉ (`deleted_at` renseigné) ne compte jamais.
//
// Module PUR (aucun import) : partagé par les classements serveur, le
// classement public et la génération des rondes suisses.

/** Statuts d'un match joué et tranché, qui compte au classement. */
export const COUNTED_MATCH_STATUSES = ['finished', 'walkover'] as const;

export function isCountedStatus(status: string | null | undefined): boolean {
  return status === 'finished' || status === 'walkover';
}

/** Match qui compte : statut tranché et pas supprimé. */
export function isCountedMatch(m: {
  status: string | null;
  deleted_at?: string | null;
}): boolean {
  return isCountedStatus(m.status) && !m.deleted_at;
}
