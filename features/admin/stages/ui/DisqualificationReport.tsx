// features/admin/stages/ui/DisqualificationReport.tsx — bandeau persistant
// après une disqualification qui n'a pas pu tout traiter : matchs en litige,
// sans adversaire, modifiés entre-temps, en échec ou non traités. Le toast
// disparaît ; ces matchs-là, quelqu'un doit aller les régler.

import Link from 'next/link';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanWarnBox } from '@/features/admin/_shared/ui/ruban';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStageTeams from '@/lib/i18n/locales/admin-fr/adminStageTeams';
import type { DisqualifyTeamResponse } from '../client';

type Dict = typeof nsAdminStageTeams.fr;

/** Vrai si la réponse laisse des matchs à traiter à la main. */
export function needsManualFollowUp(res: DisqualifyTeamResponse): boolean {
  return !res.complete || res.skipped.length > 0;
}

type Item = { id: string; note: string };

function itemsOf(res: DisqualifyTeamResponse, t: Dict): Item[] {
  const skipNote = {
    disputed: t.dqSkipDisputed,
    no_opponent: t.dqSkipNoOpponent,
    status_changed: t.dqSkipStatusChanged,
  } as const;
  return [
    ...res.skipped.map((s) => ({ id: s.id, note: skipNote[s.reason] })),
    ...(res.failed
      ? [
          {
            id: res.failed.id,
            note: format(t.dqFailed, { error: res.failed.error }),
          },
        ]
      : []),
    ...res.notProcessed.map((id) => ({ id, note: t.dqNotProcessed })),
  ];
}

export default function DisqualificationReport({
  result,
  onDismiss,
}: {
  result: DisqualifyTeamResponse;
  onDismiss: () => void;
}) {
  const t = useAdminT(nsAdminStageTeams);
  const items = itemsOf(result, t);
  return (
    <div
      role="alert"
      className={`mb-4 ${rubanWarnBox}`}
      data-testid="disqualification-report"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">
          {format(t.dqReportTitle, {
            team: result.teamName ?? result.teamId.slice(0, 8),
          })}
        </p>
        <AdminButton size="xs" variant="ghost" onClick={onDismiss}>
          {t.dqReportDismiss}
        </AdminButton>
      </div>
      <p className="mt-1 text-xs">{t.dqReportIntro}</p>
      {!result.complete && (
        <p className="mt-1 text-xs">{t.dqReportIncomplete}</p>
      )}
      <ul className="mt-2 space-y-1 text-xs">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={`/admin/matches/${encodeURIComponent(it.id)}/edit`}
              className="font-mono underline underline-offset-2 hover:text-[var(--t1,#f4edf7)]"
            >
              {format(t.dqOpenMatch, { id: it.id.slice(0, 8) })}
            </Link>{' '}
            — {it.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
