// components/tournament/HeroBanStats.tsx
// Section « Héros les plus bannis » de l'onglet Stats d'un tournoi.
// Données agrégées côté serveur (utils/matches/heroBans.computeHeroBanStats) ;
// ce composant ne fait qu'afficher. Aucun portrait : le héros est un nom, pas
// une image.

import { useT, format } from '@/lib/i18n/useT';
import nsTournamentStats from '@/lib/i18n/locales/fr/tournamentStats';

export type HeroBanStatView = {
  hero: string;
  name: string;
  role: string | null;
  bans: number;
  rate: number;
  bannedBy: { team: string; count: number }[];
};

export default function HeroBanStats({
  mapsWithBans,
  heroes,
}: {
  mapsWithBans: number;
  heroes: HeroBanStatView[];
}) {
  const t = useT(nsTournamentStats);
  if (heroes.length === 0) return null;

  const roleLabel = (role: string | null) =>
    role === 'tank'
      ? t.roleTank
      : role === 'damage'
        ? t.roleDamage
        : role === 'support'
          ? t.roleSupport
          : '—';

  return (
    <section className="mb-6">
      <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
        <h2 className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
          {t.heroBansHeading}
        </h2>
        <p className="text-[11px] text-gray-500 mb-3">
          {mapsWithBans === 1
            ? t.heroBansIntro_one
            : format(t.heroBansIntro, { maps: mapsWithBans })}
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="text-gray-400 border-b border-white/10">
                <th scope="col" className="text-left py-1.5 pr-3">
                  {t.colHero}
                </th>
                <th scope="col" className="text-left py-1.5 pr-3">
                  {t.colRole}
                </th>
                <th scope="col" className="text-right py-1.5 px-3">
                  {t.colBans}
                </th>
                <th scope="col" className="text-right py-1.5 px-3">
                  {t.colBanRate}
                </th>
                <th scope="col" className="text-left py-1.5 pl-3">
                  {t.colBannedBy}
                </th>
              </tr>
            </thead>
            <tbody>
              {heroes.map((h) => (
                <tr key={h.hero} className="border-b border-white/5">
                  <td className="py-1.5 pr-3 text-gray-100">{h.name}</td>
                  <td className="py-1.5 pr-3 text-gray-400">
                    {roleLabel(h.role)}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-100">
                    {h.bans}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-300">
                    {Math.round(h.rate * 100)}%
                  </td>
                  <td className="py-1.5 pl-3 text-gray-300">
                    {h.bannedBy
                      .map((b) =>
                        b.count > 1 ? `${b.team} ×${b.count}` : b.team
                      )
                      .join(', ')}
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
