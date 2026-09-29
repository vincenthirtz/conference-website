import type { SimStats } from '@/utils/simulatorStats';
import { rubanInset } from '@/features/admin/_shared/ui/ruban';

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
            <div key={name} className={`${rubanInset} space-y-2 p-4`}>
              <div className="text-sm font-semibold">{name}</div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--s3,#2f2732)]">
                  <div
                    className="h-full rounded-full bg-[var(--or,#b467d1)] transition-all"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-[var(--t3,#a39ba6)]">
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
