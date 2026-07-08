// components/admin/director/ScheduleConflictsBanner.tsx
//
// Feature: Run-of-show — roadmap #04 (1er pas : detection + alerte des
// chevauchements d'equipe dans le planning).
//
// Bandeau d'alerte affiche dans le Director quand une equipe est programmee
// sur deux matchs dont les plages horaires PLANIFIEES se chevauchent. Detection
// + alerte SEULEMENT — pas de resolution auto (c'est le 1er pas de la roadmap).
//
// Composant presentationnel + memoise (React.memo) : le Director tick `nowMs`
// chaque seconde, mais la liste de conflits ne change que quand les horaires
// planifies bougent. React.memo evite un re-render inutile chaque seconde tant
// que la prop `conflicts` garde la meme reference (memoisee cote parent).

import { memo } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { TeamScheduleConflict } from '@/utils/eventScheduleConflicts';

type Props = {
  conflicts: TeamScheduleConflict[];
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function ScheduleConflictsBannerBase({ conflicts }: Props) {
  const t = useAdminT('adminEventDirector');

  if (conflicts.length === 0) return null;

  return (
    <section
      role="alert"
      aria-live="polite"
      data-testid="schedule-conflicts-banner"
      className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <span aria-hidden className="text-amber-300">
          ⚠️
        </span>
        <h2 className="text-sm font-semibold text-amber-200 uppercase tracking-wide">
          {t.conflictsHeading}
        </h2>
        <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-200 text-xs font-semibold">
          {conflicts.length}
        </span>
      </div>
      <p className="text-xs text-amber-200/70 mb-3">{t.conflictsSubtitle}</p>
      <ul className="space-y-1.5">
        {conflicts.map((c) => (
          <li
            key={`${c.teamId}|${c.segmentAId}|${c.segmentBId}`}
            data-testid="schedule-conflict-item"
            className="text-sm text-amber-100"
          >
            <span className="font-semibold">
              {c.teamName ?? t.conflictUnknownTeam}
            </span>{' '}
            {format(t.conflictLine, {
              matchA: c.matchALabel,
              matchB: c.matchBLabel,
            })}{' '}
            <span className="text-amber-200/60">
              (
              {format(t.conflictOverlap, {
                start: formatTime(c.overlapStart),
                end: formatTime(c.overlapEnd),
              })}
              )
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ScheduleConflictsBanner = memo(ScheduleConflictsBannerBase);
export default ScheduleConflictsBanner;
