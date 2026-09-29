// features/admin/tournaments/ui/TournamentMatchesViewBar.tsx — bascule
// liste / calendrier et encart des conflits horaires (équipe ou stream
// planifiés sur des créneaux qui se chevauchent). Présentationnel : la page
// calcule les conflits.

import { format } from '@/lib/i18n/useAdminT';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  ConflictIcon,
  type TournamentMatchesDict,
} from './TournamentMatchesShared';

export type TournamentMatchesConflict = {
  matchIds: string[];
  label: string;
  type: 'team' | 'resource';
  time: string;
};

function segmentClass(active: boolean) {
  return `inline-flex h-[38px] items-center gap-2 px-4 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] transition-colors [font-stretch:75%] ${
    active
      ? 'bg-[rgba(180,103,209,.14)] text-[var(--or-200,#eec4ff)]'
      : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
  }`;
}

export default function TournamentMatchesViewBar({
  t,
  viewMode,
  onViewMode,
  conflicts,
}: {
  t: TournamentMatchesDict;
  viewMode: 'list' | 'calendar';
  onViewMode: (mode: 'list' | 'calendar') => void;
  conflicts: Map<string, TournamentMatchesConflict>;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <div className="flex overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] print:hidden">
        <button
          type="button"
          onClick={() => onViewMode('list')}
          aria-pressed={viewMode === 'list'}
          className={segmentClass(viewMode === 'list')}
        >
          <svg
            aria-hidden
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          {t.viewList}
        </button>
        <button
          type="button"
          onClick={() => onViewMode('calendar')}
          aria-pressed={viewMode === 'calendar'}
          className={`${segmentClass(viewMode === 'calendar')} border-l border-[var(--line2,rgba(194,196,201,.2))]`}
        >
          <svg
            aria-hidden
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {t.viewCalendar}
        </button>
      </div>

      {conflicts.size > 0 && (
        <div className="flex flex-1 items-start gap-2 rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] px-4 py-3 text-sm">
          <ConflictIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--warn,#f5a524)]" />
          <div>
            <span className="font-semibold text-[#ffd9a3]">
              {format(
                conflicts.size > 1
                  ? t.conflictsSummary_other
                  : t.conflictsSummary_one,
                { count: conflicts.size }
              )}
            </span>
            <ul className="mt-1 space-y-1">
              {Array.from(conflicts.values()).map((c, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--t2,#c7bfca)]"
                >
                  <Chip tone={c.type === 'team' ? 'warn' : 'brand'}>
                    {c.type === 'team' ? t.conflictTeam : t.conflictStream}
                  </Chip>
                  <span className="font-medium text-[var(--t1,#f4edf7)]">
                    {c.label}
                  </span>{' '}
                  —{' '}
                  {format(t.conflictDetail, {
                    count: c.matchIds.length,
                    time: c.time,
                  })}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
