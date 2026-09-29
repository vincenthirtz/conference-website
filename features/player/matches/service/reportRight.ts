// features/player/matches/service/reportRight.ts — QUI peut déclarer le score
// d'un match, en UN seul endroit (lot P12, constat S4 du plan).
//
// La règle ne change pas : capitaine au sens strict (`teams.captain_id`) de
// l'une des deux équipes. Elle vivait en 8 copies (report-score, liste des
// matchs, fil du match) ; elle vit ici, et les trois lectures l'appellent.
//
// POURQUOI PAS (ENCORE) UNE PERMISSION D'ÉQUIPE DÉLÉGABLE (J3). Examiné au lot
// P12 et écarté, pour quatre raisons — à rouvrir hors période de Cup :
//   1. Le rôle `manager` par défaut porte TOUT le catalogue
//      (`DEFAULT_TEAM_ROLES`, utils/teamRoles.ts) : ajouter `report_score` au
//      catalogue l'accorderait silencieusement à chaque manager des espaces
//      sans configuration de rôles — un droit gagné sans décision explicite.
//   2. La réconciliation anti-triche compte UNE voix par CÔTÉ : un délégué des
//      DEUX équipes (organisation qui encadre les deux) pourrait déclarer les
//      deux côtés seul et finaliser. Le capitanat, lui, est unique par équipe.
//   3. Le pendant bot (`/api/bot/v1/matches/{matchId}/report`, commande
//      Discord) identifie la capitaine par `captain_id` : les deux chemins
//      divergeraient sur qui vote.
//   4. Le catalogue, l'écran de délégation et `utils/teamRoles.ts` sont en
//      cours de refonte (lot P10) : les modifier en parallèle est risqué.
// Le jour où la permission existe, c'est CETTE fonction qui change (et elle
// seule), avec un refus explicite si l'appelant détient le droit sur les deux
// côtés.

/** Côté (1 ou 2) que `userId` déclare, ou `null` s'il n'en a pas le droit. */
export function reportingSide(
  userId: string,
  team1CaptainId: string | null | undefined,
  team2CaptainId: string | null | undefined
): 1 | 2 | null {
  if (team1CaptainId === userId) return 1;
  if (team2CaptainId === userId) return 2;
  return null;
}

/** L'appelant peut-il déclarer pour CETTE équipe (dont on connaît la capitaine) ? */
export function mayReportFor(
  userId: string,
  teamCaptainId: string | null | undefined
): boolean {
  return !!teamCaptainId && teamCaptainId === userId;
}

/** Statuts où plus aucun report n'est accepté (409 MATCH_FINALIZED). */
export const REPORT_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  'finished',
  'walkover',
  'cancelled',
]);
