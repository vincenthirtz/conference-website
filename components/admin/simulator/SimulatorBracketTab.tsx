import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { SimMatch, SimStage } from '@/utils/simulator';
import {
  EliminationView,
  type RoundGroup,
} from '@/components/admin/simulator/EliminationView';

/** Actions d'une phase, stables par indice (cf. `getStageHandlers` de la page). */
export type SimStageHandlers = {
  onSimulate: (id: string) => void;
  onReset: (id: string) => void;
  onToggleLock: (id: string) => void;
};
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';
import Chip from '@/features/admin/_shared/ui/Chip';
import { SIM_TITLE } from '@/features/admin/simulator/ui/simulatorClasses';

/**
 * Onglet « arbre » du simulateur : chaque phase de l'occurrence courante,
 * avec ses matchs simulables un par un.
 *
 * `getStageHandlers` et `groupByRound` viennent de la page, déjà mémoïsés :
 * ils gardent des références stables d'un rendu à l'autre, ce qui laisse
 * `memo(EliminationView)` sauter les phases inchangées.
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3).
 */
export function SimulatorBracketTab({
  stages,
  getStageHandlers,
  groupByRound,
}: {
  stages: SimStage[];
  getStageHandlers: (stageIdx: number) => SimStageHandlers;
  groupByRound: (
    matches: SimMatch[],
    side?: 'wb' | 'lb' | 'final'
  ) => RoundGroup[];
}) {
  const tx = useAdminT(nsAdminTournamentSimulator);
  return (
    <div className="space-y-8">
      {stages.map((stage, stageIdx) => (
        <div key={stage.id}>
          <h3 className={`mb-4 flex items-center gap-2 ${SIM_TITLE}`}>
            <Chip tone="brand">{stage.stage_type}</Chip>
            {stage.name}
            <span className="text-sm font-normal normal-case text-[var(--t4,#807984)]">
              {format(tx.matchesCount, {
                count: stage.matches.length,
              })}
            </span>
          </h3>

          {(stage.stage_type === 'bracket' ||
            stage.stage_type === 'showmatch') && (
            <>
              {/* WB */}
              <EliminationView
                rounds={groupByRound(stage.matches, 'wb')}
                onSimulate={getStageHandlers(stageIdx).onSimulate}
                onReset={getStageHandlers(stageIdx).onReset}
                onToggleLock={getStageHandlers(stageIdx).onToggleLock}
                label={
                  stage.matches.some((m) => m.bracket_side === 'lb')
                    ? tx.winnersBracket
                    : undefined
                }
              />
              {/* LB */}
              {stage.matches.some((m) => m.bracket_side === 'lb') && (
                <div className="mt-6">
                  <EliminationView
                    rounds={groupByRound(stage.matches, 'lb')}
                    onSimulate={getStageHandlers(stageIdx).onSimulate}
                    onReset={getStageHandlers(stageIdx).onReset}
                    onToggleLock={getStageHandlers(stageIdx).onToggleLock}
                    label={tx.losersBracket}
                    accentColor="text-red-300"
                  />
                </div>
              )}
              {/* Grand Final */}
              {stage.matches.some((m) => m.bracket_side === 'final') && (
                <div className="mt-6">
                  <EliminationView
                    rounds={groupByRound(stage.matches, 'final')}
                    onSimulate={getStageHandlers(stageIdx).onSimulate}
                    onReset={getStageHandlers(stageIdx).onReset}
                    onToggleLock={getStageHandlers(stageIdx).onToggleLock}
                    label={tx.grandFinal}
                    accentColor="text-amber-300"
                  />
                </div>
              )}
            </>
          )}

          {(stage.stage_type === 'swiss' ||
            stage.stage_type === 'round_robin' ||
            stage.stage_type === 'group') && (
            <EliminationView
              rounds={groupByRound(stage.matches)}
              onSimulate={getStageHandlers(stageIdx).onSimulate}
              onReset={getStageHandlers(stageIdx).onReset}
              onToggleLock={getStageHandlers(stageIdx).onToggleLock}
            />
          )}
        </div>
      ))}
    </div>
  );
}
