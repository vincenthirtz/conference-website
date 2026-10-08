// features/admin/stages/advanceSelection.ts — sélection des équipes dans la
// modale « Faire avancer des équipes » (useStageAdvanceActions).
//
// PUR. Une équipe disqualifiée de la phase n'est jamais sélectionnable : ni
// cochée à la main, ni par « tout sélectionner », ni par les présélections
// Top N / score mini / victoires mini. Le serveur la refuse de toute façon
// (409 TEAM_DISQUALIFIED) ; ici on évite d'en arriver là.

export type AdvanceSelectionRow = {
  teamId: string;
  score: number;
  wins: number;
  disqualified?: boolean;
};

export function isAdvanceSelectable(row: AdvanceSelectionRow): boolean {
  return !row.disqualified;
}

/** Équipes sélectionnables, dans l'ordre du classement. */
export function selectableRows<R extends AdvanceSelectionRow>(
  standings: R[]
): R[] {
  return standings.filter(isAdvanceSelectable);
}

/**
 * Les `n` premières équipes SÉLECTIONNABLES du classement (les disqualifiées
 * sont classées en dernier, mais on ne compte pas sur cet ordre).
 */
export function selectTopN(
  standings: AdvanceSelectionRow[],
  n: number
): Set<string> {
  return new Set(
    selectableRows(standings)
      .slice(0, Math.max(0, n))
      .map((s) => s.teamId)
  );
}

export function selectByMinScore(
  standings: AdvanceSelectionRow[],
  threshold: number
): Set<string> {
  return new Set(
    selectableRows(standings)
      .filter((s) => s.score >= threshold)
      .map((s) => s.teamId)
  );
}

export function selectByMinWins(
  standings: AdvanceSelectionRow[],
  threshold: number
): Set<string> {
  return new Set(
    selectableRows(standings)
      .filter((s) => s.wins >= threshold)
      .map((s) => s.teamId)
  );
}

/** Coche / décoche une équipe ; une équipe non sélectionnable est retirée. */
export function toggleTeam(
  prev: Set<string>,
  teamId: string,
  standings: AdvanceSelectionRow[]
): Set<string> {
  const next = new Set(prev);
  const row = standings.find((s) => s.teamId === teamId);
  if (row && !isAdvanceSelectable(row)) {
    next.delete(teamId);
    return next;
  }
  if (next.has(teamId)) next.delete(teamId);
  else next.add(teamId);
  return next;
}

/** Sélection effective : équipes cochées ET sélectionnables, ordre du classement. */
export function orderedSelection(
  standings: AdvanceSelectionRow[],
  selected: Set<string>
): string[] {
  return selectableRows(standings)
    .filter((s) => selected.has(s.teamId))
    .map((s) => s.teamId);
}

export function countSelected(
  standings: AdvanceSelectionRow[],
  selected: Set<string>
): number {
  return orderedSelection(standings, selected).length;
}

/** Toutes les équipes sélectionnables sont cochées (et il y en a au moins une). */
export function areAllSelected(
  standings: AdvanceSelectionRow[],
  selected: Set<string>
): boolean {
  const total = selectableRows(standings).length;
  return total > 0 && countSelected(standings, selected) === total;
}

/** « Tout sélectionner » : toutes les sélectionnables, ou rien si déjà fait. */
export function toggleAll(
  prev: Set<string>,
  standings: AdvanceSelectionRow[]
): Set<string> {
  return areAllSelected(standings, prev)
    ? new Set()
    : new Set(selectableRows(standings).map((s) => s.teamId));
}
