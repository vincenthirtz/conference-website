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
//
// Passe « Le Ruban » (lot 10C) : encadré d'alerte aux jetons (--warn), titre
// étroit, compteur en Chip.

import { memo } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { TeamScheduleConflict } from '@/utils/eventScheduleConflicts';
import nsAdminEventDirector from '@/lib/i18n/locales/admin-fr/adminEventDirector';
import { clockOrDash } from '@/utils/director/clock';
import Chip from '@/features/admin/_shared/ui/Chip';

type Props = {
  conflicts: TeamScheduleConflict[];
};

function ScheduleConflictsBannerBase({ conflicts }: Props) {
  const t = useAdminT(nsAdminEventDirector);

  if (conflicts.length === 0) return null;

  return (
    <section
      role="alert"
      aria-live="polite"
      data-testid="schedule-conflicts-banner"
      className="rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <span aria-hidden className="text-[var(--warn,#f5a524)]">
          ⚠️
        </span>
        <h2 className="font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.16em] text-[#ffd9a3] [font-stretch:75%]">
          {t.conflictsHeading}
        </h2>
        <Chip tone="warn">{conflicts.length}</Chip>
      </div>
      <p className="text-xs text-[var(--t2,#c7bfca)] mb-3">
        {t.conflictsSubtitle}
      </p>
      <ul className="space-y-1.5">
        {conflicts.map((c) => (
          <li
            key={`${c.teamId}|${c.segmentAId}|${c.segmentBId}`}
            data-testid="schedule-conflict-item"
            className="text-sm text-[var(--t1,#f4edf7)]"
          >
            <span className="font-semibold">
              {c.teamName ?? t.conflictUnknownTeam}
            </span>{' '}
            {format(t.conflictLine, {
              matchA: c.matchALabel,
              matchB: c.matchBLabel,
            })}{' '}
            <span className="text-[var(--t3,#a39ba6)]">
              (
              {format(t.conflictOverlap, {
                start: clockOrDash(c.overlapStart),
                end: clockOrDash(c.overlapEnd),
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
