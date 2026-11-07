// features/player/matches/threadState.ts — ce que le fil du match AFFICHE,
// dérivé de la réponse serveur et de l'horloge locale (lot P12). Pur : même
// logique que l'écran historique, testable sans DOM.
//
// Deux règles de l'écran :
//   1. On n'affiche JAMAIS un geste que le serveur refusera (`permissions`
//      vient de la réponse, calculé avec les règles des routes d'écriture).
//   2. L'horloge locale RESTREINT, elle n'élargit jamais (isCheckinStillOpen) :
//      le forfait tombe au coup d'envoi, un bouton encore ouvert mentirait.

import {
  canOfferScoreReport,
  isCheckinStillOpen,
} from '@/utils/matches/playerMatchLive';
import { disputeDeadline } from './disputeView';
import type { PlayerMatchDetail } from './schemas';

export type StepState = 'done' | 'active' | 'idle';

const FINISHED = new Set(['finished', 'completed', 'finalized', 'walkover']);

export type ThreadStatus =
  | 'cancelled'
  | 'walkover'
  | 'disputed'
  | 'finished'
  | 'ongoing'
  | 'upcoming';

/**
 * Colonnes brutes du forfait, ajoutées par l'API à la vue joueuse (contrat
 * C7). Locales ici tant que la copie synchronisée de `schemas.ts` ne les
 * porte pas : absentes d'une réponse plus ancienne, elles valent `null`.
 */
type ForfeitColumns = {
  forfeit_team_id?: string | null;
  no_show_reason?: string | null;
};

/** Qui a déclaré forfait, vu de MON équipe ; `null` si on ne le sait pas. */
export type ForfeitView = {
  side: 'mine' | 'opponent' | null;
  reason: string | null;
};

export function readForfeit(data: PlayerMatchDetail): ForfeitView {
  const cols = data.match as PlayerMatchDetail['match'] & ForfeitColumns;
  const forfeitTeamId = cols.forfeit_team_id ?? null;
  const reason = cols.no_show_reason?.trim() || null;
  let side: ForfeitView['side'] = null;
  if (forfeitTeamId && forfeitTeamId === data.team.id) side = 'mine';
  else if (forfeitTeamId && forfeitTeamId === data.opponent?.id) {
    side = 'opponent';
  } else if (!forfeitTeamId && data.match.status === 'walkover') {
    // Réponse sans la colonne : le vainqueur désigné dit qui est resté.
    if (data.result === 'win') side = 'opponent';
    else if (data.result === 'loss') side = 'mine';
  }
  return { side, reason };
}

export function matchThreadState(
  data: PlayerMatchDetail,
  now: number,
  canAct: boolean
) {
  const { match, checkin, report, opponent } = data;
  const isFinished = FINISHED.has(match.status);
  const isDisputed = match.status === 'disputed';
  // Un match annulé n'a plus d'étape : ni check-in, ni feuille, ni score.
  const isCancelled = match.status === 'cancelled';
  const isWalkover = match.status === 'walkover';
  // Clos = plus de pointage, même si l'horloge dit la fenêtre encore ouverte
  // (forfait ou annulation décidés avant le coup d'envoi).
  const checkinOpen =
    !isFinished && !isCancelled && isCheckinStillOpen(checkin, now);
  const checkinPassed =
    checkin.isPassed ||
    (!!checkin.closesAt && now > new Date(checkin.closesAt).getTime());

  const showReportCta =
    canAct &&
    canOfferScoreReport(
      {
        status: match.status,
        scheduledAt: match.scheduledAt,
        canReport: data.permissions.reportScore,
        hasOpponent: !!opponent,
      },
      now
    );

  // Le bouton de check-in n'existe que dans ce cas précis (cf. CheckinStep).
  // `=== false` : une réponse sans le champ garde l'ancien affichage.
  const showCheckinCta =
    !checkin.alreadyCheckedIn &&
    checkinOpen &&
    checkin.canCheckIn !== false &&
    !!checkin.token &&
    canAct;

  const checkinState: StepState = checkin.alreadyCheckedIn
    ? 'done'
    : checkinOpen
      ? 'active'
      : 'idle';

  const scoreState: StepState = isCancelled
    ? 'idle'
    : report.state === 'agreed' || (isFinished && !isDisputed)
      ? 'done'
      : isFinished || report.state === 'awaiting_me' || isDisputed
        ? 'active'
        : 'idle';

  const status: ThreadStatus = isCancelled
    ? 'cancelled'
    : isWalkover
      ? 'walkover'
      : isDisputed
        ? 'disputed'
        : isFinished
          ? 'finished'
          : match.status === 'ongoing'
            ? 'ongoing'
            : 'upcoming';

  // L'action principale, sous le pouce : le check-in quand il est à faire,
  // sinon le report du score. Jamais les deux dans le dock.
  const primary: 'checkin' | 'report' | null = showCheckinCta
    ? 'checkin'
    : showReportCta
      ? 'report'
      : null;

  // Échéance d'arbitrage, à l'horloge locale (le litige n'est renvoyé
  // qu'une fois ouvert ; `?.` : une réponse sans le champ ne casse rien).
  const dispute = report.dispute ?? null;
  const disputeDue = dispute ? disputeDeadline(dispute, now) : null;

  return {
    isFinished,
    isDisputed,
    isCancelled,
    isWalkover,
    forfeit: readForfeit(data),
    dispute,
    disputeDue,
    checkinOpen,
    checkinPassed,
    showReportCta,
    showCheckinCta,
    checkinState,
    scoreState,
    status,
    primary,
  };
}

export type MatchThreadState = ReturnType<typeof matchThreadState>;
