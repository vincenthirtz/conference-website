// features/admin/stages/ui/DisqualificationReport.tsx — bandeau persistant
// après une disqualification qui n'a pas pu tout traiter : matchs en litige,
// sans adversaire, modifiés entre-temps, en échec ou non traités. Le toast
// disparaît ; ces matchs-là, quelqu'un doit aller les régler.

import Link from 'next/link';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanWarnBox } from '@/features/admin/_shared/ui/ruban';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStageTeams from '@/lib/i18n/locales/admin-fr/adminStageTeams';
import type { DisqualifyMatchSummary, DisqualifyTeamResponse } from '../client';

type Dict = typeof nsAdminStageTeams.fr;

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

/**
 * « Alpha vs Beta » ; un côté inconnu (pas d'adversaire) → « à déterminer ».
 * Ni l'un ni l'autre (réponse ancienne, lecture en échec) → id court.
 */
function matchLabel(
  id: string,
  m: DisqualifyMatchSummary | undefined,
  t: Dict
): string {
  if (!m || (!m.team1Name && !m.team2Name)) {
    return format(t.dqOpenMatch, { id: id.slice(0, 8) });
  }
  return format(t.dqMatchVs, {
    team1: m.team1Name ?? t.dqMatchTbd,
    team2: m.team2Name ?? t.dqMatchTbd,
  });
}

/** « · Ronde 2 · 12/10/2026 18:00 » — seulement ce qui est connu. */
function matchDetails(m: DisqualifyMatchSummary | undefined): string {
  if (!m) return '';
  const parts: string[] = [];
  if (m.roundName) parts.push(m.roundName);
  if (m.scheduledAt) {
    const d = new Date(m.scheduledAt);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        d.toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      );
    }
  }
  return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
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
              className="underline underline-offset-2 hover:text-[var(--t1,#f4edf7)]"
            >
              {matchLabel(it.id, result.matches?.[it.id], t)}
            </Link>
            {matchDetails(result.matches?.[it.id])}
            {' — '}
            {it.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
