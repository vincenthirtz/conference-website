// components/Home/HomePodium.tsx
//
// Le podium de l'édition, dans le hero, sous l'annonce de la championne.
//
// UNE LISTE ORDONNÉE, lue 1-2-3 par un lecteur d'écran : seul l'affichage la
// range en marches 2-1-3 (`order`), comme un podium. Le rang est dit en toutes
// lettres avant chaque nom ; le chiffre de la marche, lui, est décoratif.
//
// Les données viennent du classement figé (`final_rankings`, cf.
// utils/home/loadHomePodium) : tant que le tournoi n'est pas finalisé, il n'y
// a rien à montrer et le composant ne rend rien.

import type { JSX } from 'react';
import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';
import TeamAvatar from '@/components/Team/TeamAvatar';
import type { HomePodiumEntry } from '@/utils/home/loadHomePodium';

// Par rang : place à l'écran, hauteur de marche, médaille (mêmes teintes que la
// page /tournament/…/podium), taille du blason.
const STEPS: Record<
  number,
  { order: string; height: string; medal: string; avatar: 'md' | 'lg' }
> = {
  1: {
    order: 'order-2',
    height: 'h-20 sm:h-24',
    medal:
      'border-[var(--color-yellow)]/60 bg-[var(--color-yellow)]/20 text-[var(--color-yellow)]',
    avatar: 'lg',
  },
  2: {
    order: 'order-1',
    height: 'h-14 sm:h-16',
    medal: 'border-neutral-300/50 bg-neutral-300/15 text-neutral-200',
    avatar: 'md',
  },
  3: {
    order: 'order-3',
    height: 'h-10 sm:h-12',
    medal: 'border-amber-600/60 bg-amber-600/20 text-amber-400',
    avatar: 'md',
  },
};

export default function HomePodium({
  entries,
  year,
  fullHref = null,
}: {
  entries: HomePodiumEntry[];
  year: number;
  /** Le podium complet (`/tournament/<slug>/podium`), au-delà de la 3e. */
  fullHref?: string | null;
}): JSX.Element | null {
  const t = useT(nsHomeV2);
  const shown = entries.filter((e) => STEPS[e.rank]);
  if (shown.length === 0) return null;

  const rankLabel = (rank: number) =>
    rank === 1 ? t.podiumRank1 : rank === 2 ? t.podiumRank2 : t.podiumRank3;

  return (
    <section
      aria-label={format(t.podiumAria, { year })}
      className="mt-6 w-full max-w-md"
    >
      <ol className="flex items-end justify-center gap-2 sm:gap-3">
        {shown.map(({ rank, team }) => {
          const s = STEPS[rank];
          return (
            <li
              key={team.id}
              className={`flex min-w-0 flex-1 flex-col items-center ${s.order}`}
            >
              <TeamAvatar
                name={team.name}
                shortName={team.shortName}
                logoUrl={team.logoUrl}
                size={s.avatar}
              />
              <span className="mt-2 w-full text-balance break-words text-center text-sm font-bold leading-tight text-white">
                <span className="sr-only">
                  {format(t.podiumPlaceSr, { rank: rankLabel(rank) })}{' '}
                </span>
                {team.slug ? (
                  <Link
                    href={`/team/${team.slug}`}
                    className="underline-offset-4 transition-colors hover:text-[var(--color-yellow)] hover:underline"
                  >
                    {team.name}
                  </Link>
                ) : (
                  team.name
                )}
              </span>
              <span
                aria-hidden="true"
                className={`mt-2 flex w-full justify-center rounded-t-xl border border-b-0 pt-1.5 text-xl font-extrabold tabular-nums sm:text-2xl ${s.height} ${s.medal}`}
              >
                {rank}
              </span>
            </li>
          );
        })}
      </ol>
      {fullHref && (
        <p className="mt-3 text-sm">
          <Link
            href={fullHref}
            className="text-gray-300 underline underline-offset-4 transition-colors hover:text-white"
          >
            {t.podiumFull}
          </Link>
        </p>
      )}
    </section>
  );
}
