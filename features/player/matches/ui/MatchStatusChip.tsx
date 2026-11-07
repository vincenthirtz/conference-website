// features/player/matches/ui/MatchStatusChip.tsx — la puce d'état en tête du
// fil du match. Un état par statut lisible : un match annulé ou perdu par
// forfait ne se lit plus « À venir » ou « Terminé » sans autre mot.

import type nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import { Chip } from '@/features/ruban';
import type { ThreadStatus } from '../threadState';

type T = typeof nsPlayerMatch.fr;

const TONE = {
  cancelled: 'err',
  walkover: 'neutral',
  disputed: 'warn',
  finished: 'ok',
  ongoing: 'live',
  upcoming: 'neutral',
} as const;

export function matchStatusLabel(status: ThreadStatus, t: T): string {
  return {
    cancelled: t.statusCancelled,
    walkover: t.statusWalkover,
    disputed: t.statusDisputed,
    finished: t.statusFinished,
    ongoing: t.statusOngoing,
    upcoming: t.statusUpcoming,
  }[status];
}

export default function MatchStatusChip({
  status,
  t,
}: {
  status: ThreadStatus;
  t: T;
}) {
  return <Chip tone={TONE[status]}>{matchStatusLabel(status, t)}</Chip>;
}
