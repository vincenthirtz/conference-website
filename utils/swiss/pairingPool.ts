// utils/swiss/pairingPool.ts
// Ce qui entre dans l'appariement d'une ronde suisse : la règle UNIQUE
// partagée par la génération admin (features/admin/stages/service/swiss.ts)
// et la génération bot (utils/swiss/runNextRound.ts), ainsi que par l'état de
// progression (swissStatus).
//
// - Équipes : une équipe disqualifiée de la phase (quel que soit le mode) est
//   retirée du pool à apparier. Elle ne reçoit donc jamais de BYE et n'est
//   jamais l'adversaire de personne ; un pool impair après retrait donne un
//   BYE à une équipe ÉLIGIBLE (logique BYE inchangée de pairing.ts).
// - Matchs : mêmes règles que le classement (utils/stages/countedMatches +
//   excludeAnnulledMatches) — forfait compté, annulé / supprimé ignorés, et en
//   mode `annul` TOUS les matchs de l'équipe disqualifiée ignorés pour tout le
//   monde. Ces matchs alimentent les points, le Buchholz ET l'historique
//   anti-rematch : un match annulé implique forcément l'équipe disqualifiée,
//   qui n'est plus dans le pool, donc l'exclure de l'historique ne peut
//   jamais faire naître un rematch entre équipes éligibles.
// - Ronde terminée : un match ignoré par le classement (annulé, supprimé, ou
//   impliquant une équipe disqualifiée en mode `annul`) ne bloque jamais la
//   génération de la ronde suivante. Un match encore ouvert d'une équipe
//   disqualifiée en mode `forfeit` (litige, forfait en échec) bloque
//   toujours : il comptera au classement.
//
// Module PUR (aucun accès base).

import { isCountedMatch } from '../stages/countedMatches';
import {
  excludeAnnulledMatches,
  type DisqualificationMap,
} from '../stages/disqualification';

/** Il faut au moins deux équipes éligibles pour apparier quoi que ce soit. */
export const MIN_SWISS_PAIRING_TEAMS = 2;

export type SwissPoolMatch = {
  status: string | null;
  deleted_at?: string | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
};

/** Équipes à apparier : inscrites, non disqualifiées (ordre conservé). */
export function eligibleSwissTeams<P extends { team_id: string }>(
  participants: P[],
  dq: DisqualificationMap
): P[] {
  if (dq.size === 0) return participants;
  return participants.filter((p) => !dq.has(p.team_id));
}

/**
 * Matchs qui comptent pour l'appariement de la ronde `nextRound` : rondes
 * antérieures (> 0), statut compté, non supprimés, hors matchs annulés par
 * une disqualification en mode `annul`.
 */
export function countedSwissMatches<M extends SwissPoolMatch>(
  matches: M[],
  dq: DisqualificationMap,
  nextRound: number = Number.POSITIVE_INFINITY
): M[] {
  return excludeAnnulledMatches(matches, dq).filter((m) => {
    const round = m.round_number ?? 0;
    return round > 0 && round < nextRound && isCountedMatch(m);
  });
}

/**
 * Matchs de la ronde `round` qui empêchent de générer la suivante : ni
 * comptés (terminé / forfait) ni ignorés par le classement (annulé,
 * supprimé, ou impliquant une disqualifiée en mode `annul`).
 */
export function unfinishedRoundMatches<M extends SwissPoolMatch>(
  matches: M[],
  dq: DisqualificationMap,
  round: number
): M[] {
  return excludeAnnulledMatches(matches, dq).filter(
    (m) =>
      m.round_number === round &&
      !m.deleted_at &&
      m.status !== 'cancelled' &&
      !isCountedMatch(m)
  );
}

/** Message commun quand le retrait des disqualifiées laisse < 2 équipes. */
export function notEnoughEligibleTeamsMessage(
  eligible: number,
  disqualified: number
): string {
  return `Pas assez d'equipes a apparier : ${eligible} equipe(s) eligible(s)${
    disqualified > 0 ? ` (${disqualified} disqualifiee(s) retiree(s))` : ''
  }, il en faut au moins ${MIN_SWISS_PAIRING_TEAMS}.`;
}
