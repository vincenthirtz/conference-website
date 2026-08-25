// components/player/PlayerAvatar.tsx
//
// Vignette d'une joueuse dans les listes publiques (classement, palmarès).
//
// Cascade d'affichage : photo de profil → logo de son équipe → initiales.
// WHY le logo au milieu : la plupart des joueuses n'ont pas d'avatar, et une
// liste d'initiales grises ne distingue personne. Le logo d'équipe est une
// identité visuelle qu'elles ont déjà.

import type { JSX } from 'react';
import Image from 'next/image';
import type { PlayerTeamIdentity } from '@/types/rating';

type PlayerAvatarProps = PlayerTeamIdentity & {
  avatarUrl: string | null;
  /** Libellé de la joueuse — sert d'initiales en dernier recours. */
  label: string;
  /** Côté de la vignette en pixels (carré). */
  size?: number;
  className?: string;
};

export default function PlayerAvatar({
  avatarUrl,
  teamName,
  teamLogoUrl,
  label,
  size = 32,
  className = '',
}: PlayerAvatarProps): JSX.Element {
  const box = `shrink-0 rounded-full object-cover ${className}`;
  const style = { width: size, height: size };

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={box}
        style={style}
      />
    );
  }

  if (teamLogoUrl) {
    return (
      <Image
        src={teamLogoUrl}
        // Le logo n'est pas la joueuse : on nomme l'équipe pour les lecteurs
        // d'écran plutôt que de laisser une image décorative ambiguë.
        alt={teamName ?? ''}
        title={teamName ?? undefined}
        width={size}
        height={size}
        className={`${box} bg-neutral-900 p-0.5`}
        style={style}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold uppercase ${className}`}
    >
      {label.trim()[0] ?? '?'}
    </span>
  );
}
