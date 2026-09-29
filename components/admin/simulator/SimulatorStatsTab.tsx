import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { computeHeadToHead } from '@/utils/simulator';
import type { H2HRecord, SimStage, SimTeam } from '@/utils/simulator';
import type { SimStats } from '@/utils/simulatorStats';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import { rubanCardPadded } from '@/features/admin/_shared/ui/ruban';
import {
  SIM_EYEBROW,
  SIM_MUTED,
} from '@/features/admin/simulator/ui/simulatorClasses';

/**
 * Onglet « statistiques » du simulateur : classement avec différence de
 * score, progression, compétitivité, détail par manche, confrontations.
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3).
 * Lecture seule : tout vient des props, calculées par `computeSimStats`.
 */
export function SimulatorStatsTab({
  stages,
  teams,
  stats,
}: {
  stages: SimStage[];
  teams: SimTeam[];
  stats: SimStats;
}) {
  const tx = useAdminT(nsAdminTournamentSimulator);
  return (
    <div className="space-y-6">
      {/* Standings with score diff */}
      <div className={rubanCardPadded}>
        <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.standingsHeading}</h3>
        <div className="space-y-1">
          <div className="grid grid-cols-[auto_1fr_50px_50px_50px_70px_50px] gap-2 px-3 pb-2 font-[family-name:var(--fd)] text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t4,#807984)] [font-stretch:75%]">
            <span className="w-6">#</span>
            <span>{tx.thTeam}</span>
            <span className="text-center">{tx.thWins}</span>
            <span className="text-center">{tx.thLosses}</span>
            <span className="text-center">{tx.thPct}</span>
            <span className="text-center">{tx.thMaps}</span>
            <span className="text-center">{tx.thDiff}</span>
          </div>
          {teams
            .map((t) => ({
              team: t,
              wins: stats.wins.get(t.id) ?? 0,
              losses: stats.losses.get(t.id) ?? 0,
              mapsWon: stats.mapWins.get(t.id) ?? 0,
              mapsLost: stats.mapLosses.get(t.id) ?? 0,
            }))
            .sort(
              (a, b) =>
                b.wins - a.wins ||
                a.losses - b.losses ||
                b.mapsWon - b.mapsLost - (a.mapsWon - a.mapsLost)
            )
            .map((row, i) => {
              const total = row.wins + row.losses;
              const pct = total > 0 ? Math.round((row.wins / total) * 100) : 0;
              const diff = row.mapsWon - row.mapsLost;
              return (
                <div
                  key={row.team.id}
                  className={`grid grid-cols-[auto_1fr_50px_50px_50px_70px_50px] gap-2 items-center px-3 py-2 rounded-[var(--r-ctrl,4px)] text-sm ${
                    i < 3
                      ? 'border border-[rgba(127,202,101,.25)] bg-[rgba(127,202,101,.05)]'
                      : i % 2 === 0
                        ? 'bg-[var(--s2,#1d1520)]'
                        : ''
                  }`}
                >
                  <span className="w-6 text-xs font-bold text-neutral-500">
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-medium truncate">
                      {row.team.name}
                    </span>
                    <span className="text-[9px] text-neutral-600">
                      #{row.team.seed}
                    </span>
                  </div>
                  <span className="text-center font-bold text-emerald-400">
                    {row.wins}
                  </span>
                  <span className="text-center font-bold text-red-400">
                    {row.losses}
                  </span>
                  <span className="text-center text-neutral-400">{pct}%</span>
                  <span className="text-center text-[11px] text-neutral-500">
                    {row.mapsWon}-{row.mapsLost}
                  </span>
                  <span
                    className={`text-center font-bold text-xs ${
                      diff > 0
                        ? 'text-emerald-400'
                        : diff < 0
                          ? 'text-red-400'
                          : 'text-neutral-500'
                    }`}
                  >
                    {diff > 0 ? '+' : ''}
                    {diff}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Progression */}
      <div className={rubanCardPadded}>
        <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.progressionHeading}</h3>
        <div className="flex items-center gap-4">
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--s3,#2f2732)]">
            <div
              className="h-full rounded-full bg-[var(--lf,#7fca65)] transition-all"
              style={{
                width: `${stats.total > 0 ? (stats.finished / stats.total) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums text-neutral-300">
            {stats.total > 0
              ? Math.round((stats.finished / stats.total) * 100)
              : 0}
            %
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className={SIM_MUTED}>
            {format(tx.matchesFinishedProgress, {
              finished: stats.finished,
              total: stats.total,
            })}
          </p>
          {stats.nextRoundName && (
            <p className="text-xs text-blue-400">
              {format(tx.nextPrefix, {
                name: stats.nextRoundName,
              })}
            </p>
          )}
        </div>
      </div>

      {/* Competitiveness metrics */}
      {stats.finished > 0 && (
        <div className={rubanCardPadded}>
          <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.competitivenessHeading}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatTile
              label={tx.closeMatches}
              value={stats.competitiveness.closeMatches}
              hint={format(tx.statPctOfMatches, {
                pct: stats.competitiveness.closeMatchPct,
              })}
            />
            <StatTile
              label={tx.upsets}
              value={stats.competitiveness.upsets}
              hint={format(tx.statPctOfMatches, {
                pct: stats.competitiveness.upsetPct,
              })}
            />
            <StatTile
              label={tx.mapsPerMatch}
              value={stats.competitiveness.avgMapsPerMatch}
              hint={tx.average}
            />
            <StatTile
              label={tx.longestStreak}
              value={stats.competitiveness.maxWinStreak}
              hint={tx.consecutiveWins}
            />
            <StatTile
              label={tx.avgJourney}
              value={stats.competitiveness.avgTeamJourney}
              hint={tx.matchesPerTeam}
            />
            <StatTile
              label={tx.dominance}
              value={`${stats.competitiveness.dominanceScore}%`}
              hint={
                stats.competitiveness.dominanceScore < 30
                  ? tx.domVeryBalanced
                  : stats.competitiveness.dominanceScore < 50
                    ? tx.domBalanced
                    : stats.competitiveness.dominanceScore < 70
                      ? tx.domOneFavorite
                      : tx.domDomination
              }
            />
          </div>
        </div>
      )}

      {/* Round-by-round breakdown */}
      <div className={rubanCardPadded}>
        <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.roundDetailHeading}</h3>
        <div className="space-y-2">
          {(() => {
            const allMatches = stages.flatMap((s) => s.matches);
            const roundMap = new Map<
              string,
              {
                total: number;
                finished: number;
                name: string;
              }
            >();
            for (const m of allMatches) {
              const key = `${m.bracket_side}-${m.round_number}`;
              const existing = roundMap.get(key) ?? {
                total: 0,
                finished: 0,
                name: m.round_name,
              };
              existing.total++;
              if (m.status === 'finished') existing.finished++;
              roundMap.set(key, existing);
            }
            return Array.from(roundMap.entries()).map(([key, data]) => {
              const pct =
                data.total > 0
                  ? Math.round((data.finished / data.total) * 100)
                  : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-neutral-400 w-32 truncate">
                    {data.name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--s3,#2f2732)]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct === 100
                          ? 'bg-emerald-500'
                          : pct > 0
                            ? 'bg-[var(--or,#b467d1)]'
                            : 'bg-[var(--s3,#2f2732)]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500 tabular-nums w-16 text-right">
                    {data.finished}/{data.total}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Head-to-head matrix */}
      {stats.finished > 0 &&
        (() => {
          const allMatches = stages.flatMap((s) => s.matches);
          const h2hRecords = computeHeadToHead(allMatches);
          if (h2hRecords.length === 0) return null;

          // Build a lookup map: "id1-id2" → record
          const h2hMap = new Map<string, H2HRecord>();
          for (const rec of h2hRecords) {
            h2hMap.set(`${rec.team1Id}-${rec.team2Id}`, rec);
          }

          // Sort teams by wins
          const sortedTeams = [...teams].sort(
            (a, b) => (stats.wins.get(b.id) ?? 0) - (stats.wins.get(a.id) ?? 0)
          );

          return (
            <div className={rubanCardPadded}>
              <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.h2hHeading}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line2,rgba(194,196,201,.2))]">
                      <th
                        scope="col"
                        className="text-left py-2 pr-2 text-neutral-500 font-semibold sticky left-0 bg-[var(--s1,#100812)] z-10"
                      >
                        {tx.vs}
                      </th>
                      {sortedTeams.map((t) => (
                        <th
                          scope="col"
                          key={t.id}
                          className="text-center py-2 px-1 text-neutral-500 font-semibold min-w-[50px]"
                        >
                          <span title={t.name}>{t.short_name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTeams.map((t1) => (
                      <tr
                        key={t1.id}
                        className="border-b border-[var(--line,rgba(194,196,201,.12))]"
                      >
                        <td className="py-1.5 pr-2 font-medium text-neutral-300 sticky left-0 bg-[var(--s1,#100812)] z-10">
                          {t1.short_name}
                        </td>
                        {sortedTeams.map((t2) => {
                          if (t1.id === t2.id) {
                            return (
                              <td
                                key={t2.id}
                                className="text-center py-1.5 px-1 text-neutral-800"
                              >
                                —
                              </td>
                            );
                          }
                          const key = [t1.id, t2.id].sort().join('-');
                          const rec = h2hMap.get(key);
                          if (!rec) {
                            return (
                              <td
                                key={t2.id}
                                className="text-center py-1.5 px-1 text-neutral-700"
                              >
                                -
                              </td>
                            );
                          }
                          const isFirst = t1.id === rec.team1Id;
                          const w = isFirst ? rec.team1Wins : rec.team2Wins;
                          const l = isFirst ? rec.team2Wins : rec.team1Wins;
                          return (
                            <td key={t2.id} className="text-center py-1.5 px-1">
                              <span
                                className={`tabular-nums font-semibold ${
                                  w > l
                                    ? 'text-emerald-400'
                                    : w < l
                                      ? 'text-red-400'
                                      : 'text-neutral-400'
                                }`}
                              >
                                {w}-{l}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
