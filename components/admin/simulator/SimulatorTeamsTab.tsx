import { useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { SEED_COLORS } from '@/components/admin/simulator/SimMatchCard';
import type { SimTeam } from '@/utils/simulator';
import type { SimStats } from '@/utils/simulatorStats';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';

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
      <p className="text-xs text-neutral-500 mb-4">{tx.teamsDragHint}</p>
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
            className={`rounded-xl border p-4 space-y-3 cursor-grab active:cursor-grabbing transition-all ${
              dragSeedIdx === teamIdx
                ? 'border-purple-500/50 bg-purple-500/10 opacity-50 scale-95'
                : dragSeedIdx !== null
                  ? 'border-purple-500/20 bg-white/[0.02] hover:border-purple-500/40 hover:bg-purple-500/5'
                  : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Drag handle */}
              <div
                className="flex flex-col gap-0.5 text-neutral-600 flex-shrink-0 cursor-grab"
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
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border ${
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
            <div className="flex items-center gap-2 pt-1 border-t border-white/[0.05]">
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
                className="flex-1 accent-purple-500 h-1.5"
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
