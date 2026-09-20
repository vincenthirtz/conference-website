// components/Home/HomeStandings.tsx
//
// OÙ EN EST LA SAISON — le classement de la phase en cours, sur l'accueil.
//
// Placé juste après la carte du prochain rendez-vous : « ce qui se joue »,
// puis « où ça en est ». Avant, l'accueil annonçait des affiches sans jamais
// dire qui menait, et il fallait ouvrir une sous-page du tournoi pour le
// savoir — alors que c'est la question qu'on se pose entre deux journées.
//
// Le classement N'EST PAS RECALCULÉ ici : les lignes viennent de la même
// source que l'onglet Classement (confrontation directe et départages du staff
// compris). Deux calculs finiraient par se contredire.
//
// Volontairement plus pauvre que la page dédiée : rang, équipe, bilan,
// différence de maps, points. Pas de forme, pas de critère de départage. Pas
// de lien « classement complet » non plus (retiré le 2026-09-20) : l'accueil
// répond à la question sur place, l'onglet Classement du tournoi reste la
// porte d'entrée pour le détail.

import type { JSX } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useT } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';
import type { HomeStandingRow } from '@/utils/home/loadHomeData';

function Monogram({ row }: { row: HomeStandingRow }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/50">
      {row.logoUrl ? (
        <Image
          src={row.logoUrl}
          alt=""
          width={28}
          height={28}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[9px] font-semibold text-gray-400">
          {(row.shortName || row.name).slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export default function HomeStandings({
  rows,
}: {
  rows: HomeStandingRow[];
}): JSX.Element | null {
  const t = useT(nsHomeV2);
  if (rows.length === 0) return null;

  return (
    <section className="container mx-auto px-4 pt-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white sm:text-xl">
            {t.standingsTitle}
          </h2>
        </div>

        <table className="w-full text-sm">
          <caption className="sr-only">{t.standingsTitle}</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500">
              <th scope="col" className="py-1 pr-2 text-left font-medium">
                #
              </th>
              <th scope="col" className="py-1 pr-2 text-left font-medium">
                {t.standingsColTeam}
              </th>
              <th scope="col" className="py-1 px-2 text-right font-medium">
                <abbr title={t.standingsColRecordTitle}>
                  {t.standingsColRecord}
                </abbr>
              </th>
              <th
                scope="col"
                className="hidden py-1 px-2 text-right font-medium sm:table-cell"
              >
                <abbr title={t.standingsColDiffTitle}>
                  {t.standingsColDiff}
                </abbr>
              </th>
              <th scope="col" className="py-1 pl-2 text-right font-medium">
                <abbr title={t.standingsColPointsTitle}>
                  {t.standingsColPoints}
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.teamId}
                className="border-t border-white/5 text-gray-200"
              >
                <td className="py-2 pr-2 tabular-nums text-gray-500">
                  {row.rank}
                </td>
                <td className="py-2 pr-2">
                  {row.slug ? (
                    <Link
                      href={`/team/${row.slug}`}
                      className="flex items-center gap-2 text-white transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
                    >
                      <Monogram row={row} />
                      <span className="truncate">{row.name}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 text-white">
                      <Monogram row={row} />
                      <span className="truncate">{row.name}</span>
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {row.wins}–{row.losses}
                </td>
                <td
                  className={`hidden py-2 px-2 text-right tabular-nums sm:table-cell ${
                    row.diff > 0
                      ? 'text-emerald-300'
                      : row.diff < 0
                        ? 'text-red-300'
                        : 'text-gray-400'
                  }`}
                >
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums text-white">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-[11px] text-gray-500">{t.standingsNote}</p>
      </div>
    </section>
  );
}
