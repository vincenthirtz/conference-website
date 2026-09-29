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
import type { PlayerMatchDetail } from './schemas';

export type StepState = 'done' | 'active' | 'idle';

const FINISHED = new Set(['finished', 'completed', 'finalized', 'walkover']);

export function matchThreadState(
  data: PlayerMatchDetail,
  now: number,
  canAct: boolean
) {
  const { match, checkin, report, opponent } = data;
  const isFinished = FINISHED.has(match.status);
  const isDisputed = match.status === 'disputed';
  const checkinOpen = isCheckinStillOpen(checkin, now);
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

  const scoreState: StepState =
    report.state === 'agreed' || (isFinished && !isDisputed)
      ? 'done'
      : isFinished || report.state === 'awaiting_me' || isDisputed
        ? 'active'
        : 'idle';

  const status: 'disputed' | 'finished' | 'ongoing' | 'upcoming' = isDisputed
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

  return {
    isFinished,
    isDisputed,
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
