import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { SEED_COLORS } from '@/components/admin/simulator/SimMatchCard';
import type { MonteCarloResult, SimStage, SimTeam } from '@/utils/simulator';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';

/**
 * Onglet « Monte-Carlo » du simulateur : réglage du nombre d'itérations,
 * lancement, et probabilités de titre / de parcours par équipe.
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3).
 */
export function SimulatorMonteCarloTab({
  stages,
  teams,
  result,
  running,
  iterations,
  onIterationsChange,
  onRun,
}: {
  stages: SimStage[];
  teams: SimTeam[];
  result: MonteCarloResult | null;
  running: boolean;
  iterations: number;
  onIterationsChange: (value: number) => void;
  onRun: () => void;
}) {
  const tx = useAdminT(nsAdminTournamentSimulator);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
          {tx.monteCarloHeading}
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          {tx.monteCarloDesc}
          {stages.flatMap((s) => s.matches).some((m) => m.locked) && (
            <span className="text-amber-400 ml-1">{tx.lockedPreserved}</span>
          )}
        </p>
        <div className="flex items-center gap-4 mb-6">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
              {tx.iterationsLabel}
            </label>
            <div className="flex gap-2">
              {[100, 500, 1000, 5000].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onIterationsChange(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    iterations === n
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {n >= 1000 ? `${n / 1000}k` : n}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={onRun}
            disabled={running}
            className={`px-6 py-3 rounded-lg text-sm font-semibold shadow transition-colors ${
              running
                ? 'bg-neutral-700 text-neutral-400 cursor-wait animate-pulse'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {running
              ? tx.calcInProgress
              : format(tx.runSimulations, {
                  count: iterations,
                })}
          </button>
        </div>

        {result && (
          <div className="space-y-6">
            <p className="text-xs text-neutral-500">
              {format(tx.iterationsCompleted, {
                count: result.iterations,
              })}
            </p>

            {/* Win probability ranking */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">
                {tx.winProbability}
              </h4>
              <div className="space-y-2">
                {teams
                  .map((t) => ({
                    team: t,
                    prob: result.winProbability.get(t.id) ?? 0,
                    wins: result.winCounts.get(t.id) ?? 0,
                  }))
                  .sort((a, b) => b.prob - a.prob)
                  .map((row, i) => (
                    <div key={row.team.id} className="flex items-center gap-3">
                      <span className="w-6 text-xs font-bold text-neutral-500">
                        {i + 1}
                      </span>
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold border ${
                          SEED_COLORS[row.team.seed] ??
                          'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
                        }`}
                      >
                        {row.team.seed}
                      </span>
                      <span className="text-sm font-medium w-40 truncate">
                        {row.team.name}
                      </span>
                      <div className="flex-1 h-3 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all bg-gradient-to-r from-purple-600 to-emerald-500"
                          style={{
                            width: `${row.prob * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums w-16 text-right text-white">
                        {(row.prob * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-neutral-500 tabular-nums w-16 text-right">
                        {row.wins}/{result.iterations}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Placement distribution for top 4 */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">
                {tx.placementDist}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th
                        scope="col"
                        className="text-left py-2 pr-4 text-neutral-500 font-semibold"
                      >
                        {tx.thTeam}
                      </th>
                      {Array.from(
                        { length: Math.min(teams.length, 8) },
                        (_, i) => (
                          <th
                            scope="col"
                            key={i}
                            className="text-center py-2 px-2 text-neutral-500 font-semibold"
                          >
                            {i === 0
                              ? tx.placement1st
                              : i === 1
                                ? tx.placement2nd
                                : format(tx.placementNth, {
                                    n: i + 1,
                                  })}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {teams
                      .map((t) => ({
                        team: t,
                        dist: result.placementDist.get(t.id) ?? [],
                      }))
                      .sort((a, b) => (b.dist[0] ?? 0) - (a.dist[0] ?? 0))
                      .slice(0, 8)
                      .map((row) => (
                        <tr
                          key={row.team.id}
                          className="border-b border-white/[0.03]"
                        >
                          <td className="py-2 pr-4 font-medium">
                            {row.team.short_name}
                          </td>
                          {Array.from(
                            {
                              length: Math.min(teams.length, 8),
                            },
                            (_, i) => {
                              const count = row.dist[i] ?? 0;
                              const pct =
                                result.iterations > 0
                                  ? Math.round(
                                      (count / result.iterations) * 100
                                    )
                                  : 0;
                              return (
                                <td key={i} className="text-center py-2 px-2">
                                  <span
                                    className={`tabular-nums ${
                                      pct > 30
                                        ? 'text-emerald-400 font-bold'
                                        : pct > 15
                                          ? 'text-sky-400'
                                          : pct > 5
                                            ? 'text-neutral-300'
                                            : 'text-neutral-600'
                                    }`}
                                  >
                                    {pct > 0 ? `${pct}%` : '-'}
                                  </span>
                                </td>
                              );
                            }
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
