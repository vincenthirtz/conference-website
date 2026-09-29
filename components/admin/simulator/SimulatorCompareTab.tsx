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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { CARD, CARD_FLUSH } from '@/features/admin/stages/ui/rubanClasses';
import {
  SIM_EYEBROW,
  SIM_MUTED,
  simOptionClass,
} from '@/features/admin/simulator/ui/simulatorClasses';

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
      <div className={CARD}>
        <h3 className={`mb-4 ${SIM_EYEBROW}`}>{tx.compareHeading}</h3>
        <p className={`mb-4 ${SIM_MUTED}`}>
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
                  className={simOptionClass(compareConfig?.formatType === f)}
                >
                  {tx.vs} {FORMAT_LABELS[f]}
                </button>
              );
            })}
        </div>
        {compareConfig && (
          <div className="flex gap-2">
            <AdminButton size="xs" onClick={() => onCompare(compareConfig)}>
              {tx.regenerate}
            </AdminButton>
            <AdminButton size="xs" onClick={onClear}>
              {tx.clear}
            </AdminButton>
          </div>
        )}
      </div>

      {/* Side-by-side display */}
      {compareData && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Current config */}
          <div className={`${CARD_FLUSH} space-y-4 p-4`}>
            <div className="flex items-center gap-2">
              <Chip tone="brand">{tx.badgeCurrent}</Chip>
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
          <div className={`${CARD_FLUSH} space-y-4 p-4`}>
            <div className="flex items-center gap-2">
              <Chip tone="neutral">{tx.badgeComparison}</Chip>
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
