import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { SEED_COLORS } from '@/components/admin/simulator/SimMatchCard';
import type { MonteCarloResult, SimStage, SimTeam } from '@/utils/simulator';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanCardPadded } from '@/features/admin/_shared/ui/ruban';
import {
  SIM_EYEBROW,
  SIM_MUTED,
  simOptionClass,
} from '@/features/admin/simulator/ui/simulatorClasses';

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
      <div className={rubanCardPadded}>
        <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.monteCarloHeading}</h3>
        <p className={`mb-4 ${SIM_MUTED}`}>
          {tx.monteCarloDesc}
          {stages.flatMap((s) => s.matches).some((m) => m.locked) && (
            <span className="text-amber-400 ml-1">{tx.lockedPreserved}</span>
          )}
        </p>
        <div className="flex items-center gap-4 mb-6">
          <div>
            <label className={`mb-1 block ${SIM_EYEBROW}`}>
              {tx.iterationsLabel}
            </label>
            <div className="flex gap-2">
              {[100, 500, 1000, 5000].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onIterationsChange(n)}
                  className={simOptionClass(iterations === n)}
                >
                  {n >= 1000 ? `${n / 1000}k` : n}
                </button>
              ))}
            </div>
          </div>
          <AdminButton
            variant="primary"
            onClick={onRun}
            disabled={running}
            className={running ? 'animate-pulse' : ''}
          >
            {running
              ? tx.calcInProgress
              : format(tx.runSimulations, {
                  count: iterations,
                })}
          </AdminButton>
        </div>

        {result && (
          <div className="space-y-6">
            <p className={SIM_MUTED}>
              {format(tx.iterationsCompleted, {
                count: result.iterations,
              })}
            </p>

            {/* Win probability ranking */}
            <div>
              <h4 className={`mb-3 ${SIM_EYEBROW}`}>{tx.winProbability}</h4>
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
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--s3,#2f2732)]">
                        <div
                          className="h-full rounded-full bg-[var(--or,#b467d1)] transition-all"
                          style={{
                            width: `${row.prob * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums w-16 text-right text-[var(--t1,#f4edf7)]">
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
              <h4 className={`mb-3 ${SIM_EYEBROW}`}>{tx.placementDist}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line2,rgba(194,196,201,.2))]">
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
                          className="border-b border-[var(--line,rgba(194,196,201,.12))]"
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
