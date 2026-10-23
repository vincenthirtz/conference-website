// components/tournament/landing/FinalRanking.tsx
//
// « Classement final » — en tête de la landing d'un tournoi clos : le podium
// (marches 2-1-3, comme à l'accueil), puis le reste du classement.
//
// La source est `final_rankings` (readPublicTournamentStandings), figé par la
// finalisation admin : le seul classement qui ne bouge plus. Le tableau de la
// saison régulière reste dans le bilan, juste en dessous — ce n'est pas le même
// classement : la finale peut renverser la première place, comme en 2026.
//
// LISTES ORDONNÉES, lues 1-2-3… par un lecteur d'écran : seul l'affichage range
// le podium en 2-1-3 (`order`). Le rang est dit en toutes lettres ; le chiffre
// des marches est décoratif. Sans classement figé, la section ne rend rien.

import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';
import TeamAvatar from '@/components/Team/TeamAvatar';
import type { PublicStanding } from '@/utils/public/readStandings';
import { Section, SectionHeader, GlassCard, Spotlight } from './primitives';

// Par rang : place à l'écran, hauteur de marche, médaille (teintes de la page
// Podium et de l'accueil), taille du blason, corps du nom.
const STEPS: Record<
  number,
  {
    order: string;
    height: string;
    medal: string;
    avatar: 'lg' | 'xl';
    name: string;
  }
> = {
  1: {
    order: 'order-2',
    height: 'h-24 sm:h-32',
    medal:
      'border-[var(--color-yellow)]/60 bg-[var(--color-yellow)]/20 text-[var(--color-yellow)]',
    avatar: 'xl',
    name: 'text-base sm:text-xl',
  },
  2: {
    order: 'order-1',
    height: 'h-16 sm:h-24',
    medal: 'border-neutral-300/50 bg-neutral-300/15 text-neutral-200',
    avatar: 'lg',
    name: 'text-sm sm:text-base',
  },
  3: {
    order: 'order-3',
    height: 'h-12 sm:h-16',
    medal: 'border-amber-600/60 bg-amber-600/20 text-amber-400',
    avatar: 'lg',
    name: 'text-sm sm:text-base',
  },
};

function TeamName({
  row,
  className = '',
}: {
  row: PublicStanding;
  className?: string;
}) {
  const name = row.teamName ?? '—';
  return row.teamSlug ? (
    <Link
      prefetch={false}
      href={`/team/${row.teamSlug}`}
      className={`underline-offset-4 transition-colors hover:text-[var(--color-yellow)] hover:underline ${className}`}
    >
      {name}
    </Link>
  ) : (
    <span className={className}>{name}</span>
  );
}

export default function FinalRanking({
  ranking,
  tournamentPath,
}: {
  ranking: PublicStanding[];
  tournamentPath: string;
}) {
  const t = useT(nsTournamentLanding);
  if (ranking.length === 0) return null;

  const podium = ranking.filter((r) => STEPS[r.rank]);
  const rest = ranking.filter((r) => !STEPS[r.rank]);
  const rankLabel = (rank: number) =>
    rank === 1
      ? t.rankingRank1
      : rank === 2
        ? t.rankingRank2
        : rank === 3
          ? t.rankingRank3
          : format(t.rankingRankN, { rank });

  return (
    <Section id="classement-final">
      <Spotlight
        color="yellow"
        className="left-[-10%] top-0 h-[360px] w-[520px] opacity-60"
      />
      <SectionHeader
        eyebrow={t.rankingEyebrow}
        title={t.rankingTitle}
        subtitle={t.rankingSubtitle}
        align="left"
        action={
          <Link
            href={`${tournamentPath}/podium`}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-yellow)]/40 bg-[var(--color-yellow)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--color-yellow)] transition-colors hover:border-[var(--color-yellow)]/70 hover:bg-[var(--color-yellow)]/20"
          >
            {t.ctaViewPodium} →
          </Link>
        }
      />

      <GlassCard className="p-5 sm:p-8">
        {podium.length > 0 && (
          <ol
            aria-label={t.rankingPodiumAria}
            className="mx-auto flex max-w-2xl items-end justify-center gap-3 sm:gap-6"
          >
            {podium.map((row) => {
              const s = STEPS[row.rank];
              return (
                <li
                  key={row.teamId}
                  className={`flex min-w-0 flex-1 flex-col items-center ${s.order}`}
                >
                  <TeamAvatar
                    name={row.teamName ?? '—'}
                    logoUrl={row.logoUrl}
                    size={s.avatar}
                  />
                  <span
                    className={`mt-3 w-full text-balance break-words text-center font-bold leading-tight text-white ${s.name}`}
                  >
                    <span className="sr-only">
                      {format(t.rankingPlaceSr, {
                        rank: rankLabel(row.rank),
                      })}{' '}
                    </span>
                    <TeamName row={row} />
                  </span>
                  {row.prize && (
                    <span className="mt-1 text-center text-xs text-[var(--color-yellow-light)]">
                      {row.prize}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className={`mt-3 flex w-full justify-center rounded-t-2xl border border-b-0 pt-2 text-2xl font-extrabold tabular-nums sm:text-3xl ${s.height} ${s.medal}`}
                  >
                    {row.rank}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {rest.length > 0 && (
          <ol className="mx-auto mt-8 max-w-2xl divide-y divide-white/5 border-t border-white/10">
            {rest.map((row) => (
              <li key={row.teamId} className="flex items-center gap-3 py-3">
                <span className="w-10 shrink-0 font-mono text-sm text-gray-400">
                  {rankLabel(row.rank)}
                </span>
                <TeamAvatar
                  name={row.teamName ?? '—'}
                  logoUrl={row.logoUrl}
                  size="sm"
                />
                <TeamName
                  row={row}
                  className="min-w-0 flex-1 truncate font-semibold text-gray-100"
                />
                {row.prize && (
                  <span className="shrink-0 text-xs text-[var(--color-yellow-light)]">
                    {row.prize}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </GlassCard>
    </Section>
  );
}
