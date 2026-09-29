import { useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { SEED_COLORS } from '@/components/admin/simulator/SimMatchCard';
import type { SimTeam } from '@/utils/simulator';
import type { SimStats } from '@/utils/simulatorStats';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';
import {
  SIM_CHECKBOX,
  SIM_MUTED,
} from '@/features/admin/simulator/ui/simulatorClasses';

/**
 * Onglet « équipes » du simulateur : ordre des têtes de série (glisser-
 * déposer), force de chaque équipe, bilan de la simulation en cours.
 *
 * L'état du glisser-déposer est local : la page ne reçoit que le résultat
 * (`onReorder`).
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3).
 */
export function SimulatorTeamsTab({
  teams,
  stats,
  onReorder,
  onStrengthChange,
}: {
  teams: SimTeam[];
  stats: SimStats;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onStrengthChange: (teamId: string, strength: number) => void;
}) {
  const tx = useAdminT(nsAdminTournamentSimulator);
  const [dragSeedIdx, setDragSeedIdx] = useState<number | null>(null);
  return (
    <div>
      <p className={`mb-4 ${SIM_MUTED}`}>{tx.teamsDragHint}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {teams.map((team, teamIdx) => (
          <div
            key={team.id}
            draggable
            onDragStart={() => setDragSeedIdx(teamIdx)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragSeedIdx !== null && dragSeedIdx !== teamIdx) {
                onReorder(dragSeedIdx, teamIdx);
              }
              setDragSeedIdx(null);
            }}
            onDragEnd={() => setDragSeedIdx(null)}
            className={`cursor-grab space-y-3 rounded-[var(--r-card,14px)] border p-4 transition-all active:cursor-grabbing ${
              dragSeedIdx === teamIdx
                ? 'scale-95 border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.1)] opacity-50'
                : dragSeedIdx !== null
                  ? 'border-[rgba(180,103,209,.3)] bg-[var(--s1,#100812)] hover:border-[var(--or,#b467d1)]'
                  : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Drag handle */}
              <div
                className="flex flex-shrink-0 cursor-grab flex-col gap-0.5 text-[var(--t4,#807984)]"
                title={tx.dragToReorder}
              >
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="w-1 h-1 rounded-full bg-current" />
                </div>
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="w-1 h-1 rounded-full bg-current" />
                </div>
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="w-1 h-1 rounded-full bg-current" />
                </div>
              </div>
              <div
                className={`w-10 h-10 rounded-[var(--r-ctrl,4px)] flex items-center justify-center text-sm font-bold border ${
                  SEED_COLORS[team.seed] ??
                  'bg-purple-500/20 text-purple-300 border-purple-500/30'
                }`}
              >
                {team.short_name}
              </div>
              <div>
                <div className="text-sm font-semibold">{team.name}</div>
                <div className="text-[10px] text-neutral-500">
                  {format(tx.seedLabel, { seed: team.seed })}
                </div>
              </div>
              {stats.wins.has(team.id) && (
                <div className="ml-auto text-right">
                  <div className="text-xs font-bold text-emerald-400">
                    {stats.wins.get(team.id)}W
                  </div>
                  <div className="text-xs font-bold text-red-400">
                    {stats.losses.get(team.id) ?? 0}L
                  </div>
                </div>
              )}
            </div>
            {/* Strength slider */}
            <div className="flex items-center gap-2 border-t border-[var(--line,rgba(194,196,201,.12))] pt-1">
              <span className="text-[10px] text-neutral-500 font-semibold w-10">
                {tx.strengthLabel}
              </span>
              <input
                type="range"
                min={1}
                max={100}
                value={team.strength}
                onChange={(e) =>
                  onStrengthChange(team.id, parseInt(e.target.value))
                }
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className={`h-1.5 flex-1 ${SIM_CHECKBOX}`}
                draggable={false}
              />
              <span
                className={`text-xs font-bold tabular-nums w-8 text-right ${
                  team.strength >= 70
                    ? 'text-emerald-400'
                    : team.strength >= 45
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {team.strength}
              </span>
            </div>
            <div className="space-y-1">
              {team.players.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-neutral-300">{p.name}</span>
                  <span className="text-neutral-600 font-mono text-[10px]">
                    {p.battleTag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
