// features/player/matches/disputeView.ts — ce que l'écran dit d'un litige
// ouvert et d'une capture refusée (lot P4). Pur, testable sans DOM.

import { format } from '@/lib/i18n/useT';
import type nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import type { PlayerMatchDispute } from './schemas';

type T = typeof nsPlayerMatch.fr;

/** 45 → « 45 min », 60 → « 1 h », 90 → « 1 h 30 min ». */
export function formatSlaDuration(minutes: number, t: T): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return format(t.durationMinutes, { n: m });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0
    ? format(t.durationHours, { n: h })
    : format(t.durationHoursMinutes, { h, m: rest });
}

/**
 * Le délai d'arbitrage : échéance à venir, dépassée, ou inconnue (litige non
 * daté — on annonce alors le seul délai visé).
 */
export function disputeDeadline(
  dispute: Pick<PlayerMatchDispute, 'expectedBy'>,
  now: number
): 'pending' | 'overdue' | 'unknown' {
  if (!dispute.expectedBy) return 'unknown';
  const at = Date.parse(dispute.expectedBy);
  if (!Number.isFinite(at)) return 'unknown';
  return now >= at ? 'overdue' : 'pending';
}

/**
 * Lien vers le formulaire /support pré-rempli (catégorie `dispute`, sujet,
 * message avec l'adresse du match). Construit ici plutôt qu'importé : la
 * lecture de la query côté /support est l'affaire de cette page.
 */
export function disputeTicketHref(
  t: T,
  args: {
    matchUrl: string;
    team: string;
    opponent: string;
    mine: { mine: number; opponent: number } | null;
  }
): string {
  const params = new URLSearchParams({ category: 'dispute' });
  params.set(
    'subject',
    format(t.disputeTicketSubject, {
      team: args.team,
      opponent: args.opponent,
    })
  );
  params.set(
    'message',
    format(t.disputeTicketMessage, {
      url: args.matchUrl,
      mine: args.mine?.mine ?? '?',
      opponent: args.mine?.opponent ?? '?',
    })
  );
  return `/support?${params.toString()}`;
}

/** Refus de POST …/evidence → message traduit (jamais le texte serveur). */
export function evidenceErrorMessage(
  status: number,
  code: string | null,
  t: T
): string {
  if (code === 'EVIDENCE_TOO_LARGE') return t.evidenceErrTooLarge;
  if (code === 'EVIDENCE_NOT_IMAGE' || code === 'EVIDENCE_EMPTY') {
    return t.evidenceErrType;
  }
  if (code === 'REPORT_BOTH_SIDES') return t.evidenceErrBothSides;
  if (code === 'NOT_REPORTER' || status === 403) return t.evidenceErrRight;
  if (status === 401) return t.evidenceErrSession;
  if (status === 429) return t.evidenceErrRateLimited;
  // Corps refusé par la validation (trop gros pour le schéma) ou par Next.
  if (status === 413) return t.evidenceErrTooLarge;
  return t.evidenceErrGeneric;
}
