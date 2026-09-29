import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { formatMatchDate } from '@/utils/simulatorFakeData';
import type { OccurrenceData } from '@/utils/simulatorSerialization';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import { CARD } from '@/features/admin/stages/ui/rubanClasses';
import { SIM_EYEBROW } from '@/features/admin/simulator/ui/simulatorClasses';

/**
 * Onglet « calendrier » du simulateur : une carte par occurrence (avancement,
 * bornes de dates, volumes) et la synthèse sur toutes les occurrences.
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3). Lecture
 * seule : choisir une occurrence remonte par `onSelect`, la page décide
 * d'afficher son arbre.
 */
export function SimulatorTimelineTab({
  occurrences,
  activeOccurrence,
  onSelect,
}: {
  occurrences: OccurrenceData[];
  activeOccurrence: number;
  onSelect: (index: number) => void;
}) {
  const tx = useAdminT(nsAdminTournamentSimulator);
  return (
    <div className="space-y-6">
      <div className={CARD}>
        <h3 className={`mb-6 ${SIM_EYEBROW}`}>{tx.calendarHeading}</h3>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-[var(--line2,rgba(194,196,201,.2))]" />

          <div className="space-y-6">
            {occurrences.map((occ, i) => {
              const allMatches = occ.stages.flatMap((s) => s.matches);
              const finished = allMatches.filter(
                (m) => m.status === 'finished'
              ).length;
              const total = allMatches.length;
              const firstDate = allMatches.find(
                (m) => m.scheduled_at
              )?.scheduled_at;
              const lastDate = [...allMatches]
                .reverse()
                .find((m) => m.scheduled_at)?.scheduled_at;
              const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

              return (
                <div key={i} className="flex gap-4 items-start">
                  {/* Dot on the line */}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs font-bold ${
                      activeOccurrence === i
                        ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.2)] text-[var(--or-200,#eec4ff)]'
                        : pct === 100
                          ? 'border-[rgba(127,202,101,.55)] bg-[rgba(127,202,101,.13)] text-[var(--lf-200,#b3e7a3)]'
                          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t3,#a39ba6)]'
                    }`}
                  >
                    {i + 1}
                  </div>

                  {/* Card */}
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className={`flex-1 rounded-[var(--r-ctrl,4px)] border p-4 text-left transition-colors ${
                      activeOccurrence === i
                        ? 'border-[rgba(180,103,209,.55)] bg-[rgba(180,103,209,.08)]'
                        : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] hover:border-[var(--t4,#807984)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">{occ.label}</span>
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          pct === 100
                            ? 'text-emerald-400'
                            : pct > 0
                              ? 'text-amber-400'
                              : 'text-neutral-500'
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--t3,#a39ba6)]">
                      {firstDate && (
                        <span>
                          {format(tx.startLabel, {
                            date: formatMatchDate(firstDate),
                          })}
                        </span>
                      )}
                      {lastDate && lastDate !== firstDate && (
                        <span>
                          {format(tx.endLabel, {
                            date: formatMatchDate(lastDate),
                          })}
                        </span>
                      )}
                      <span>
                        {format(tx.matchesInline, {
                          count: total,
                        })}
                      </span>
                      <span>
                        {format(tx.teamsInline, {
                          count: occ.teams.length,
                        })}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--s3,#2f2732)]">
                      <div
                        className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-[var(--lf,#7fca65)]' : 'bg-[var(--or,#b467d1)]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary across all occurrences */}
      <div>
        <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.globalSummary}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            label={tx.totalMatches}
            value={occurrences.reduce(
              (sum, occ) => sum + occ.stages.flatMap((s) => s.matches).length,
              0
            )}
          />
          <StatTile
            label={tx.summaryFinished}
            tone="ok"
            value={occurrences.reduce(
              (sum, occ) =>
                sum +
                occ.stages
                  .flatMap((s) => s.matches)
                  .filter((m) => m.status === 'finished').length,
              0
            )}
          />
          <StatTile
            label={tx.totalDuration}
            value={(() => {
              const allDates = occurrences.flatMap(
                (occ) =>
                  occ.stages
                    .flatMap((s) => s.matches)
                    .map((m) => m.scheduled_at)
                    .filter(Boolean) as string[]
              );
              if (allDates.length < 2) return '—';
              const sorted = allDates.sort();
              const first = new Date(sorted[0]);
              const last = new Date(sorted[sorted.length - 1]);
              const days = Math.ceil(
                (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)
              );
              return `${days}j`;
            })()}
          />
          <StatTile
            label={tx.uniqueTeams}
            value={
              new Set(
                occurrences.flatMap((occ) => occ.teams.map((t) => t.name))
              ).size
            }
          />
        </div>
      </div>
    </div>
  );
}
