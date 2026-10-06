// features/player/matches/ui/MatchDisputePanel.tsx — le litige OUVERT, vu
// par une équipe (lot P4) : les deux déclarations, le délai d'arbitrage visé
// (celui du cron dispute-sla-check) et le recours (ticket litige pré-rempli).
//
// Présentationnel : la donnée n'existe que si le serveur l'a renvoyée, soit
// une fois le litige ouvert (`report.dispute`, cf. service/detail.ts).

import type nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import { format } from '@/lib/i18n/useT';
import { ButtonLink } from '@/features/ruban';
import { disputeTicketHref, formatSlaDuration } from '../disputeView';
import type { PlayerMatchDetail } from '../schemas';
import type { MatchThreadState } from '../threadState';

type T = typeof nsPlayerMatch.fr;

export default function MatchDisputePanel({
  data,
  view,
  t,
  formatDate,
}: {
  data: PlayerMatchDetail;
  view: MatchThreadState;
  t: T;
  formatDate: (iso: string | null) => string;
}) {
  const { dispute } = view;
  if (!dispute) return null;
  const { report, team, opponent, match } = data;
  const duration = formatSlaDuration(dispute.slaMinutes, t);

  return (
    <div className="mt-3 space-y-1" data-testid="match-dispute-panel">
      {dispute.openedByStaff && (
        <p className="text-amber-200">{t.disputeStaffOpened}</p>
      )}
      {report.mine && (
        <p className="font-mono tabular-nums">
          {format(t.disputeMine, {
            mine: report.mine.mine,
            opponent: report.mine.opponent,
          })}
        </p>
      )}
      <p className="font-mono tabular-nums">
        {dispute.opponentReport
          ? format(t.disputeOpponent, {
              mine: dispute.opponentReport.mine,
              opponent: dispute.opponentReport.opponent,
            })
          : t.disputeOpponentNone}
      </p>
      <p className="text-xs">
        {view.disputeDue === 'pending'
          ? format(t.disputeExpectedBy, {
              date: formatDate(dispute.expectedBy),
              duration,
            })
          : view.disputeDue === 'overdue'
            ? format(t.disputeOverdue, { duration })
            : format(t.disputeSlaOnly, { duration })}
      </p>
      <p className="pt-1 text-xs">{t.disputeTicketHint}</p>
      <ButtonLink
        size="sm"
        className="mt-1"
        href={disputeTicketHref(t, {
          matchUrl: `/player/match/${encodeURIComponent(match.id)}`,
          team: team.name,
          opponent: opponent?.name ?? '—',
          mine: report.mine,
        })}
      >
        {t.disputeTicketCta}
      </ButtonLink>
    </div>
  );
}
