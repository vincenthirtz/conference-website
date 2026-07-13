// components/player/DirectoryPlayerCard.tsx
// Fiche réutilisable du réseau joueuses. Utilisée par les trois onglets de
// /player/discovery (Découvrir, Je suis, Mes abonnés) — une seule source de
// vérité pour l'avatar, l'accroche, les badges d'équipes, le compteur
// d'abonnés et le bouton Suivre.
//
// La carte n'est PAS un unique <a> : le nom/avatar lient vers le profil, les
// badges d'équipes lient vers leur page, et FollowButton est un <button> — on
// évite l'imbrication d'ancres (HTML invalide) tout en gardant chaque zone
// cliquable indépendante.

import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import FollowButton from './FollowButton';

// Objet joueuse partagé, renvoyé par la recherche ET le graphe de suivi.
export type DirectoryPlayer = {
  authUserId: string;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  discordUsername: string | null;
  stats?: {
    games: number;
    peakRating: number;
    tenants: number;
  };
  teams?: { name: string; slug: string | null }[];
  isFollowing: boolean;
  followerCount: number;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((p) => p.charAt(0).toUpperCase()).join('');
  return letters || 'J';
}

type DirectoryPlayerCardProps = {
  player: DirectoryPlayer;
  currentUserId?: string | null;
  /** Remonte la bascule d'abonnement pour maj optimiste du compteur parent. */
  onFollowChange?: (authUserId: string, following: boolean) => void;
};

export default function DirectoryPlayerCard({
  player,
  currentUserId,
  onFollowChange,
}: DirectoryPlayerCardProps) {
  const t = useT('playerDiscovery');
  const teams = player.teams ?? [];

  return (
    <article className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 transition hover:border-purple-500/50 hover:bg-white/[0.05]">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/player/${player.authUserId}`}
          className="group flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
        >
          {player.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.avatarUrl}
              alt=""
              className="w-12 h-12 rounded-xl border border-purple-500/40 object-cover"
            />
          ) : (
            <span className="flex w-12 h-12 items-center justify-center rounded-xl border border-purple-500/40 bg-purple-600/20 text-base font-bold text-purple-100">
              {initialsOf(player.displayName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white group-hover:text-purple-200 transition">
              {player.displayName}
            </p>
            {player.discordUsername && (
              <p className="truncate text-xs text-gray-500">
                @{player.discordUsername}
              </p>
            )}
          </div>
        </Link>

        <FollowButton
          authUserId={player.authUserId}
          initialFollowing={player.isFollowing}
          currentUserId={currentUserId}
          onChange={(following) =>
            onFollowChange?.(player.authUserId, following)
          }
        />
      </div>

      {player.tagline && (
        <p className="mt-3 line-clamp-2 text-xs text-gray-400">
          {player.tagline}
        </p>
      )}

      {teams.length > 0 && (
        <ul aria-label={t.teamsSrLabel} className="mt-3 flex flex-wrap gap-1.5">
          {teams.map((team, i) =>
            team.slug ? (
              <li key={`${team.slug}-${i}`}>
                <Link
                  href={`/team/${team.slug}`}
                  className="inline-flex max-w-[9rem] items-center truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-gray-300 transition hover:border-purple-500/40 hover:text-purple-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                >
                  {team.name}
                </Link>
              </li>
            ) : (
              <li key={`${team.name}-${i}`}>
                <span className="inline-flex max-w-[9rem] items-center truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-gray-400">
                  {team.name}
                </span>
              </li>
            )
          )}
        </ul>
      )}

      <div className="mt-auto space-y-1 pt-3">
        <p className="text-xs text-gray-500 tabular-nums">
          {format(t.followerCount, { count: player.followerCount })}
        </p>
        {player.stats && (
          <p className="text-xs text-gray-500 tabular-nums">
            {format(t.statsLine, {
              games: player.stats.games,
              peak: player.stats.peakRating,
              tenants: player.stats.tenants,
            })}
          </p>
        )}
      </div>
    </article>
  );
}
