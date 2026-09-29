// features/player/network/scoutingModel.ts — règles pures du dossier
// d'adversaire (N5, lot P15), sans rendu ni appel.

import type { ScoutingResponse } from './schemas';

/**
 * Le dossier n'a RIEN à dire : aucune confrontation, forme et bilan sous le
 * seuil, pas d'adversaire commun, pas de créneau, pas de note.
 *
 * C'est le cas de presque toutes les équipes à l'ouverture d'un tournoi. Quatre
 * sections disant chacune « pas assez de données » se lisaient comme une page
 * en panne ; un seul état vide, qui dit pourquoi et propose le seul geste utile
 * (jouer contre elles), est honnête. Dès qu'UNE section a matière, la page
 * normale revient — une section vide y reste instructive à côté des autres.
 */
export function isScoutingDossierEmpty(
  data: Pick<ScoutingResponse, 'report' | 'myNotes'>
): boolean {
  const r = data.report;
  return (
    r.headToHead.played === 0 &&
    (!r.recentForm || !r.record) &&
    r.commonOpponents.length === 0 &&
    (!r.usualSlots || r.usualSlots.length === 0) &&
    data.myNotes.length === 0
  );
}

/**
 * Même adresse que l'annuaire des équipes (`/player/teams`) : l'adversaire
 * arrive présélectionné dans le formulaire de demande.
 */
export function proposeScrimHref(targetTeamId: string): string {
  return `/player/requests?tab=scrim&team=${encodeURIComponent(targetTeamId)}`;
}
