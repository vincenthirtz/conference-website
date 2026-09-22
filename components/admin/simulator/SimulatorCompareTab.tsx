import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { FormatType } from '@/types/admin';
import type { SimMatch, SimStage, SimTeam } from '@/utils/simulator';
import { FORMAT_LABELS, type SimConfig } from '@/utils/simulatorSerialization';
import {
  EliminationView,
  type RoundGroup,
} from '@/components/admin/simulator/EliminationView';
import type { SimStageHandlers } from '@/components/admin/simulator/SimulatorBracketTab';

/** Actions vides, stables (module) : la variante comparée est en lecture seule. */
const NOOP_SIM_ACTION = (_id: string) => {};
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';

/**
 * Onglet « comparer » du simulateur : la configuration courante face à une
 * variante (autre format, autre nombre d'équipes), arbres côte à côte.
 *
 * Lecture seule côté variante : ses matchs ne se simulent pas un par un.
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3).
 */
export function SimulatorCompareTab({
  config,
  stages,
  teams,
  compareConfig,
  compareData,
  validCountsFor,
  getStageHandlers,
  groupByRound,
  onCompare,
  onClear,
}: {
  config: SimConfig;
  stages: SimStage[];
  teams: SimTeam[];
  compareConfig: Partial<SimConfig> | null;
  compareData: { stages: SimStage[]; teams: SimTeam[] } | null;
  validCountsFor: (f: FormatType) => number[];
  getStageHandlers: (stageIdx: number) => SimStageHandlers;
  groupByRound: (
    matches: SimMatch[],
    side?: 'wb' | 'lb' | 'final'
  ) => RoundGroup[];
  onCompare: (altConfig: Partial<SimConfig>) => void;
  onClear: () => void;
}) {
  const tx = useAdminT(nsAdminTournamentSimulator);
  return (
    <div className="space-y-6">
      {/* Config selector for comparison */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
          {tx.compareHeading}
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          {format(tx.compareDesc, {
            format: FORMAT_LABELS[config.formatType],
          })}
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(FORMAT_LABELS) as FormatType[])
            .filter((f) => f !== config.formatType && f !== 'showmatch')
            .map((f) => {
              const tc = validCountsFor(f).includes(config.teamCount)
                ? config.teamCount
                : 8;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() =>
                    onCompare({
                      formatType: f,
                      teamCount: tc,
                      ...(f === 'double_elim' ? { grandFinalReset: true } : {}),
                    })
                  }
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    compareConfig?.formatType === f
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {tx.vs} {FORMAT_LABELS[f]}
                </button>
              );
            })}
        </div>
        {compareConfig && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCompare(compareConfig)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
            >
              {tx.regenerate}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
            >
              {tx.clear}
            </button>
          </div>
        )}
      </div>

      {/* Side-by-side display */}
      {compareData && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Current config */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
                {tx.badgeCurrent}
              </span>
              <span className="text-sm font-semibold">
                {FORMAT_LABELS[config.formatType]}
              </span>
              <span className="text-xs text-neutral-500">
                {format(tx.teamsBoLabel, {
                  count: teams.length,
                  bo: config.bestOf,
                })}
              </span>
            </div>
            <div className="text-xs text-neutral-400 space-y-1">
              <div>
                {format(tx.matchesColon, {
                  count: stages.flatMap((s) => s.matches).length,
                })}
              </div>
              <div>
                {format(tx.roundsColon, {
                  count: new Set(
                    stages
                      .flatMap((s) => s.matches)
                      .map((m) => `${m.bracket_side}-${m.round_number}`)
                  ).size,
                })}
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              {stages.map((stage, stageIdx) => (
                <div key={stage.id} className="mb-4">
                  <p className="text-xs font-semibold text-purple-300 mb-2">
                    {stage.name}
                  </p>
                  <EliminationView
                    rounds={groupByRound(
                      stage.matches,
                      stage.stage_type === 'bracket' ? 'wb' : undefined
                    )}
                    onSimulate={getStageHandlers(stageIdx).onSimulate}
                    onReset={getStageHandlers(stageIdx).onReset}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Compare config */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.02] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/20">
                {tx.badgeComparison}
              </span>
              <span className="text-sm font-semibold">
                {FORMAT_LABELS[compareConfig?.formatType ?? config.formatType]}
              </span>
              <span className="text-xs text-neutral-500">
                {format(tx.teamsBoLabel, {
                  count: compareData.teams.length,
                  bo: config.bestOf,
                })}
              </span>
            </div>
            <div className="text-xs text-neutral-400 space-y-1">
              <div>
                {format(tx.matchesColon, {
                  count: compareData.stages.flatMap((s) => s.matches).length,
                })}
              </div>
              <div>
                {format(tx.roundsColon, {
                  count: new Set(
                    compareData.stages
                      .flatMap((s) => s.matches)
                      .map((m) => `${m.bracket_side}-${m.round_number}`)
                  ).size,
                })}
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              {compareData.stages.map((stage) => (
                <div key={stage.id} className="mb-4">
                  <p className="text-xs font-semibold text-sky-300 mb-2">
                    {stage.name}
                  </p>
                  <EliminationView
                    rounds={groupByRound(
                      stage.matches,
                      stage.stage_type === 'bracket' ? 'wb' : undefined
                    )}
                    onSimulate={NOOP_SIM_ACTION}
                    onReset={NOOP_SIM_ACTION}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
