import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { FormatType } from '@/types/admin';
import type { CompetitivenessMetrics } from '@/utils/simulator';
import { FORMAT_LABELS } from '@/utils/simulatorSerialization';

/** Une simulation terminée, gardée pour comparaison dans la session. */
export type SimHistoryEntry = {
  id: number;
  timestamp: number;
  formatType: FormatType;
  teamCount: number;
  bestOf: number;
  standings: { name: string; seed: number; wins: number; losses: number }[];
  competitiveness: CompetitivenessMetrics;
};
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';

/**
 * Onglet « historique » du simulateur : les simulations passées de la
 * session (format, équipes, classement final, compétitivité).
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3).
 */
export function SimulatorHistoryTab({
  entries,
  onClear,
}: {
  entries: SimHistoryEntry[];
  onClear: () => void;
}) {
  const tx = useAdminT(nsAdminTournamentSimulator);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {tx.historyHeading}
          </h3>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
            >
              {tx.clearHistory}
            </button>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-500">{tx.historyEmpty}</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="rounded-lg border border-white/10 bg-white/[0.01] p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-neutral-500">
                      #{entries.length - idx}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {new Date(entry.timestamp).toLocaleString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {FORMAT_LABELS[entry.formatType]}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {format(tx.teamsBoLabel, {
                        count: entry.teamCount,
                        bo: entry.bestOf,
                      })}
                    </span>
                  </div>
                  <div className="flex gap-4 text-[10px]">
                    <span className="text-amber-400" title={tx.closeMatches}>
                      {format(tx.closePct, {
                        pct: entry.competitiveness.closeMatchPct,
                      })}
                    </span>
                    <span className="text-rose-400" title={tx.upsets}>
                      {format(tx.upsetsCount, {
                        count: entry.competitiveness.upsets,
                      })}
                    </span>
                  </div>
                </div>
                {/* Top 5 standings */}
                <div className="flex gap-4 flex-wrap">
                  {entry.standings.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold ${
                          i === 0
                            ? 'text-amber-400'
                            : i === 1
                              ? 'text-neutral-300'
                              : i === 2
                                ? 'text-orange-400'
                                : 'text-neutral-500'
                        }`}
                      >
                        {i + 1}.
                      </span>
                      <span className="text-xs text-neutral-300">{s.name}</span>
                      <span className="text-[10px] text-neutral-600">
                        {s.wins}V-{s.losses}D
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
