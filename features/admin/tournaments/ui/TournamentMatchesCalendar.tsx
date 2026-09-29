// features/admin/tournaments/ui/TournamentMatchesCalendar.tsx — vue
// calendrier de l'écran « matchs du tournoi » : un bloc par jour DU TOURNOI,
// puis les matchs non planifiés ; états chargement et vide. Présentationnel :
// la page groupe les matchs et calcule les conflits.

import { format } from '@/lib/i18n/useAdminT';
import { AdminButtonLink } from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { Match } from '@/types/admin';
import { formatMatchTime } from '@/utils/matches/adminMatchesTz';
import {
  ConflictIcon,
  TM_CARD,
  TournamentMatchesSpinner,
  stageLabel,
  statusLabel,
  statusTone,
  type TournamentMatchesDict,
} from './TournamentMatchesShared';

const DAY_HEAD =
  'border-b border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-5 py-3';
const DAY_TITLE =
  'font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.16em] [font-stretch:75%]';
const ROWS = 'divide-y divide-[var(--line,rgba(194,196,201,.12))]';

function teamName(team: Match['team1']) {
  return team?.short_name || team?.name || 'TBD';
}

export default function TournamentMatchesCalendar({
  t,
  loading,
  matches,
  calendarDays,
  conflictMatchIds,
  timezone,
}: {
  t: TournamentMatchesDict;
  loading: boolean;
  matches: Match[];
  calendarDays: {
    days: { key: string; label: string; matches: Match[] }[];
    unscheduled: Match[];
  };
  conflictMatchIds: Set<string>;
  timezone: string;
}) {
  if (loading) {
    return (
      <section className={`${TM_CARD} overflow-hidden`}>
        <TournamentMatchesSpinner />
      </section>
    );
  }
  if (matches.length === 0) {
    return (
      <section
        className={`${TM_CARD} mb-6 p-20 text-center text-[var(--t3,#a39ba6)]`}
      >
        {t.emptyMatches}
      </section>
    );
  }

  return (
    <section className="mb-6 space-y-6">
      {calendarDays.days.map(({ key, label, matches: dayMatches }) => (
        <div key={key} className={`${TM_CARD} overflow-hidden`}>
          <div className={DAY_HEAD}>
            <h3 className={`${DAY_TITLE} text-[var(--t1,#f4edf7)]`}>{label}</h3>
            <span className="text-xs text-[var(--t3,#a39ba6)]" data-numeric>
              {format(
                dayMatches.length > 1
                  ? t.dayMatchCount_other
                  : t.dayMatchCount_one,
                { count: dayMatches.length }
              )}
            </span>
          </div>

          <div className={ROWS}>
            {dayMatches.map((m) => {
              const time = formatMatchTime(m.scheduled_at, timezone);
              const hasConflict = conflictMatchIds.has(m.id);

              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--s2,#1d1520)] ${
                    hasConflict
                      ? 'border-l-4 border-l-[var(--warn,#f5a524)] bg-[rgba(245,165,36,.06)]'
                      : ''
                  }`}
                >
                  {/* Time slot */}
                  <div className="w-16 flex-shrink-0 text-center">
                    <div
                      className="font-[family-name:var(--fd)] text-lg font-bold text-[var(--or-300,#dea3f6)] [font-stretch:75%]"
                      data-numeric
                    >
                      {time}
                    </div>
                  </div>

                  {/* Conflict icon */}
                  {hasConflict && (
                    <span
                      title={t.conflictTitle}
                      className="flex-shrink-0 text-[var(--warn,#f5a524)]"
                    >
                      <ConflictIcon className="h-4 w-4" />
                    </span>
                  )}

                  {/* Teams */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="truncate text-sm font-medium text-[var(--t1,#f4edf7)]">
                      {teamName(m.team1)}
                    </span>
                    <span className="text-xs text-[var(--t4,#807984)]">vs</span>
                    <span className="truncate text-sm font-medium text-[var(--t1,#f4edf7)]">
                      {teamName(m.team2)}
                    </span>
                  </div>

                  {/* Score / Status */}
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {typeof m.team1_score === 'number' ||
                    typeof m.team2_score === 'number' ? (
                      <span
                        className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-3 py-1 text-sm font-bold text-[var(--t1,#f4edf7)]"
                        data-numeric
                      >
                        {m.team1_score ?? 0} - {m.team2_score ?? 0}
                      </span>
                    ) : null}
                    <Chip tone={statusTone(m.status)}>
                      {statusLabel(t, m.status)}
                    </Chip>
                  </div>

                  {/* Stage info */}
                  <div className="w-32 flex-shrink-0 text-right">
                    <div className="truncate text-xs text-[var(--t3,#a39ba6)]">
                      {stageLabel(t, m.stage)}
                    </div>
                    <div className="text-[10px] text-[var(--t4,#807984)]">
                      R{m.round_number ?? '?'}
                      {m.best_of ? ` • BO${m.best_of}` : ''}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 gap-1.5 print:hidden">
                    <AdminButtonLink
                      href={`/admin/matches/${m.id}/edit`}
                      variant="ghost"
                      size="xs"
                    >
                      {t.edit}
                    </AdminButtonLink>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Unscheduled matches */}
      {calendarDays.unscheduled.length > 0 && (
        <div className={`${TM_CARD} overflow-hidden`}>
          <div className={DAY_HEAD}>
            <h3 className={`${DAY_TITLE} text-[var(--t3,#a39ba6)]`}>
              {t.unscheduled}
            </h3>
            <span className="text-xs text-[var(--t4,#807984)]" data-numeric>
              {format(
                calendarDays.unscheduled.length > 1
                  ? t.unscheduledCount_other
                  : t.unscheduledCount_one,
                { count: calendarDays.unscheduled.length }
              )}
            </span>
          </div>
          <div className={ROWS}>
            {calendarDays.unscheduled.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-16 flex-shrink-0 text-center">
                  <span className="text-sm text-[var(--t4,#807984)]">—</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="truncate text-sm font-medium text-[var(--t3,#a39ba6)]">
                    {teamName(m.team1)}
                  </span>
                  <span className="text-xs text-[var(--t4,#807984)]">vs</span>
                  <span className="truncate text-sm font-medium text-[var(--t3,#a39ba6)]">
                    {teamName(m.team2)}
                  </span>
                </div>
                <Chip tone={statusTone(m.status)}>
                  {statusLabel(t, m.status)}
                </Chip>
                <div className="w-32 flex-shrink-0 text-right">
                  <div className="truncate text-xs text-[var(--t3,#a39ba6)]">
                    {stageLabel(t, m.stage)}
                  </div>
                </div>
                <AdminButtonLink
                  href={`/admin/matches/${m.id}/edit`}
                  variant="ghost"
                  size="xs"
                >
                  {t.edit}
                </AdminButtonLink>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
