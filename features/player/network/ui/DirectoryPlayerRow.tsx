// features/player/network/ui/DirectoryPlayerRow.tsx — une joueuse du réseau
// dans la LISTE (lot P15) : avatar + nom (lien vers la fiche), Discord,
// bouton Suivre, accroche, équipes, abonnés, stats. Remplace
// components/player/DirectoryPlayerCard.
//
// PAS un unique <a> : nom/avatar lient vers la fiche, chaque équipe vers sa
// page, et Suivre est un <button> — jamais d'ancres imbriquées.
//
// Le bouton Suivre reste components/player/FollowButton : il sert aussi la
// fiche PUBLIQUE, qui ne doit pas tirer features/player.

import Image from 'next/image';
import Link from 'next/link';
import FollowButton from '@/components/player/FollowButton';
import { Card, Chip, rubanHelp, rubanStrong } from '@/features/ruban';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerDiscovery from '@/lib/i18n/locales/fr/playerDiscovery';
import type { DirectoryPlayer } from '../schemas';

const AVATAR =
  'h-12 w-12 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'J';
}

function Avatar({ player }: { player: DirectoryPlayer }) {
  if (!player.avatarUrl) {
    return (
      <span
        className={`${AVATAR} flex items-center justify-center bg-[var(--s3,#2f2732)] text-base font-bold text-[var(--or-300,#dea3f6)]`}
      >
        {initialsOf(player.displayName)}
      </span>
    );
  }
  // `next/image` seulement pour un hôte déclaré (sinon il échoue au rendu).
  return isOptimizableImageUrl(player.avatarUrl) ? (
    <Image
      src={player.avatarUrl}
      alt=""
      width={48}
      height={48}
      className={AVATAR}
    />
  ) : (
    // biome-ignore lint/performance/noImgElement: hôte hors `remotePatterns`, `next/image` échouerait
    <img
      src={player.avatarUrl}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      className={AVATAR}
    />
  );
}

export default function DirectoryPlayerRow({
  player,
  currentUserId,
  onFollowChange,
}: {
  player: DirectoryPlayer;
  currentUserId?: string | null;
  /** Bascule d'abonnement, pour la mise à jour locale de la liste. */
  onFollowChange?: (authUserId: string, following: boolean) => void;
}) {
  const t = useT(nsPlayerDiscovery);
  const teams = player.teams ?? [];
  return (
    <Card as="li" padding="sm" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/player/${player.authUserId}`}
          className="flex min-w-0 items-center gap-3 rounded-[var(--r-ctrl,4px)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)]"
        >
          <Avatar player={player} />
          <span className="min-w-0">
            <span
              className={`block truncate text-sm font-semibold ${rubanStrong}`}
            >
              {player.displayName}
            </span>
            {player.discordUsername && (
              <span className={`block truncate ${rubanHelp}`}>
                @{player.discordUsername}
              </span>
            )}
          </span>
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
        <p className={`line-clamp-2 ${rubanHelp}`}>{player.tagline}</p>
      )}

      {teams.length > 0 && (
        <ul aria-label={t.teamsSrLabel} className="flex flex-wrap gap-1.5">
          {teams.map((team, i) => (
            <li key={`${team.slug ?? team.name}-${i}`}>
              {team.slug ? (
                <Link href={`/team/${team.slug}`} className="inline-flex">
                  <Chip>{team.name}</Chip>
                </Link>
              ) : (
                <Chip>{team.name}</Chip>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={`${rubanHelp} tabular-nums`} data-numeric>
        {format(t.followerCount, { count: player.followerCount })}
        {player.stats &&
          ` · ${format(t.statsLine, {
            games: player.stats.games,
            peak: player.stats.peakRating,
            tenants: player.stats.tenants,
          })}`}
      </p>
    </Card>
  );
}
