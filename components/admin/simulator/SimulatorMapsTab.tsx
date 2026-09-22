import type { SimStats } from '@/utils/simulatorStats';

/**
 * Onglet « maps » du simulateur : le pool de maps et le nombre de fois
 * où chacune a été jouée dans la simulation en cours.
 *
 * Sorti de `pages/admin/tournament-simulator.tsx` (règle A7, lot 3).
 */
export function SimulatorMapsTab({
  mapPool,
  stats,
}: {
  mapPool: string[];
  stats: SimStats;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {mapPool.map((name) => {
          const count = stats.mapCount.get(name) ?? 0;
          const maxCount = Math.max(...stats.mapCount.values(), 1);
          return (
            <div
              key={name}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2"
            >
              <div className="text-sm font-semibold">{name}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-neutral-400 tabular-nums w-8 text-right">
                  {count}x
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
