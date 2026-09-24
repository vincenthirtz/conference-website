// components/tournament/MapBanStats.tsx
// Section « Bans par map » de l'onglet Stats d'un tournoi : pour chaque map
// jouée, combien de fois, combien de fois choisie par une équipe, et les
// héros qu'on y a bannis. Données : utils/matches/heroBans.computeMapBanStats.

import { useT, format } from '@/lib/i18n/useT';
import type { MapBanStat } from '@/utils/matches/heroBans';
import nsTournamentStats from '@/lib/i18n/locales/fr/tournamentStats';

const ROLE_DOT: Record<string, string> = {
  tank: 'bg-sky-400',
  damage: 'bg-red-400',
  support: 'bg-emerald-400',
};

export default function MapBanStats({ maps }: { maps: MapBanStat[] }) {
  const t = useT(nsTournamentStats);
  if (maps.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
        <h2 className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
          {t.mapBansHeading}
        </h2>
        <p className="text-[11px] text-gray-500 mb-3">{t.mapBansIntro}</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="text-gray-400 border-b border-white/10">
                <th scope="col" className="text-left py-1.5 pr-3">
                  {t.colMap}
                </th>
                <th scope="col" className="text-right py-1.5 px-3">
                  {t.colMapPlayed}
                </th>
                <th scope="col" className="text-right py-1.5 px-3">
                  {t.colMapPicked}
                </th>
                <th scope="col" className="text-left py-1.5 pl-3">
                  {t.colMapBans}
                </th>
              </tr>
            </thead>
            <tbody>
              {maps.map((m) => (
                <tr key={m.map} className="border-b border-white/5 align-top">
                  <td className="py-2 pr-3 font-semibold text-gray-100 whitespace-nowrap">
                    {m.map}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-200">
                    {m.played}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-300">
                    {m.picked}
                  </td>
                  <td className="py-2 pl-3">
                    {m.bans.length === 0 ? (
                      <span className="text-gray-500">{t.mapBansNone}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {m.bans.map((b) => (
                          <span
                            key={b.hero}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-gray-100 whitespace-nowrap"
                            title={format(t.mapBansChipTitle, {
                              hero: b.name,
                              count: b.count,
                              maps: m.mapsWithBans,
                            })}
                          >
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full ${
                                (b.role && ROLE_DOT[b.role]) || 'bg-gray-500'
                              }`}
                            />
                            {b.name}
                            {b.count > 1 && (
                              <span className="text-gray-400">×{b.count}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
