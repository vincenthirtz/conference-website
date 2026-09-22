import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { formatMatchDate } from '@/utils/simulatorFakeData';
import type { OccurrenceData } from '@/utils/simulatorSerialization';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';

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
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-sm font-semibold mb-6 uppercase tracking-wider text-neutral-400">
          {tx.calendarHeading}
        </h3>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-purple-500/20" />

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
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : pct === 100
                          ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                          : 'bg-neutral-800 border-neutral-600 text-neutral-400'
                    }`}
                  >
                    {i + 1}
                  </div>

                  {/* Card */}
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                      activeOccurrence === i
                        ? 'border-purple-500/30 bg-purple-500/5'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
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
                    <div className="flex items-center gap-4 text-xs text-neutral-400">
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
                    <div className="mt-2 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all"
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
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
          {tx.globalSummary}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              {tx.totalMatches}
            </div>
            <div className="text-2xl font-bold mt-1">
              {occurrences.reduce(
                (sum, occ) => sum + occ.stages.flatMap((s) => s.matches).length,
                0
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              {tx.summaryFinished}
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-400">
              {occurrences.reduce(
                (sum, occ) =>
                  sum +
                  occ.stages
                    .flatMap((s) => s.matches)
                    .filter((m) => m.status === 'finished').length,
                0
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              {tx.totalDuration}
            </div>
            <div className="text-2xl font-bold mt-1 text-purple-400">
              {(() => {
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
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              {tx.uniqueTeams}
            </div>
            <div className="text-2xl font-bold mt-1 text-sky-400">
              {
                new Set(
                  occurrences.flatMap((occ) => occ.teams.map((t) => t.name))
                ).size
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
