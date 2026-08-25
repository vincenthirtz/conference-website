// components/Home/HomePlayers.tsx
//
// Section « joueuses » de l'accueil : le podium du classement Glicko-2 + les
// dernières MVP de match. L'accueil parlait jusqu'ici de tournoi, d'équipes et
// de partenaires — jamais des joueuses elles-mêmes. C'est la seule section qui
// nomme des personnes, avec un lien direct vers leur profil public.
//
// Rendu SSR : les noms sont dans le HTML initial (indexables, et le maillage
// interne vers /player/[userId] compte pour leur référencement).

import type { JSX } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { LeaderboardPlayer } from '@/types/rating';
import { useT, format } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

/** MVP récente, agrégée depuis `match_mvp_polls` par le loader de l'accueil. */
export type HomeMvp = {
  userId: string | null;
  label: string;
  teamName: string | null;
  teamSlug: string | null;
  matchId: string;
};

type HomePlayersProps = {
  players: LeaderboardPlayer[];
  mvps: HomeMvp[];
};

function playerLabel(player: LeaderboardPlayer, fallback: string): string {
  return player.displayName || player.battleTag || fallback;
}

function initials(name: string): string {
  const cleaned = name.replace(/#.*$/, '').trim();
  if (!cleaned) return '?';
  return cleaned.slice(0, 2).toUpperCase();
}

function rankClass(rank: number): string {
  if (rank === 1) return 'border-amber-400/50 bg-amber-400/15 text-amber-200';
  if (rank === 2)
    return 'border-neutral-300/40 bg-neutral-300/10 text-neutral-100';
  if (rank === 3)
    return 'border-orange-400/40 bg-orange-400/10 text-orange-200';
  return 'border-white/10 bg-white/5 text-gray-300';
}

function PlayerCard({ player }: { player: LeaderboardPlayer }): JSX.Element {
  const t = useT(nsHomeV2);
  const name = playerLabel(player, t.playersUnknown);
  return (
    <Link
      href={`/player/${encodeURIComponent(player.userId)}`}
      className="card-brand group flex items-center gap-3 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-4 transition-all duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] motion-reduce:transform-none"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${rankClass(player.rank)}`}
        aria-hidden="true"
      >
        {player.rank}
      </span>
      {player.avatarUrl ? (
        <Image
          src={player.avatarUrl}
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-violet)]/40 to-[var(--color-green)]/25 text-xs font-bold text-white"
        >
          {initials(name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-white">
          {name}
        </span>
        <span className="block text-xs text-gray-400">
          {format(t.playersRecord, {
            rating: Math.round(player.rating),
            wins: player.wins,
            losses: player.losses,
          })}
        </span>
      </span>
    </Link>
  );
}

export default function HomePlayers({
  players,
  mvps,
}: HomePlayersProps): JSX.Element | null {
  const t = useT(nsHomeV2);
  const top = players.slice(0, 3);
  const recentMvps = mvps.slice(0, 3);

  // Section muette hors saison : un podium vide et une liste de MVP vide ne
  // valent pas un titre sur l'accueil.
  if (top.length === 0 && recentMvps.length === 0) return null;

  return (
    <section
      id="joueuses"
      className="container mx-auto mt-16 px-4 md:mt-20 md:px-0"
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            {t.playersEyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {t.playersTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            {t.playersLead}
          </p>
        </div>
        <Link
          href="/leaderboard"
          className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-green-light)] transition hover:text-[var(--color-green)] sm:inline-flex"
        >
          {t.playersAll}
          <span aria-hidden>→</span>
        </Link>
      </div>

      {top.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((player) => (
            <PlayerCard key={player.userId} player={player} />
          ))}
        </div>
      )}

      {recentMvps.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/80">
            {t.playersMvpTitle}
          </p>
          <ul className="flex flex-wrap gap-2">
            {recentMvps.map((mvp) => (
              <li key={mvp.matchId}>
                <Link
                  href={
                    mvp.userId
                      ? `/player/${encodeURIComponent(mvp.userId)}`
                      : `/match/${mvp.matchId}`
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white transition hover:border-amber-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
                >
                  <span aria-hidden="true" className="text-amber-300">
                    ★
                  </span>
                  <span className="font-semibold">{mvp.label}</span>
                  {mvp.teamName && (
                    <span className="text-gray-400">{mvp.teamName}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex justify-center sm:hidden">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white transition hover:border-[var(--color-yellow)]/60 hover:text-[var(--color-yellow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
        >
          {t.playersAll}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
