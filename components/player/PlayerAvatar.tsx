// components/player/PlayerAvatar.tsx
//
// Vignette d'une joueuse (classement, palmarès, en-tête de sa fiche publique).
//
// Cascade d'affichage : photo de profil → logo de son équipe → initiales.
// WHY le logo au milieu : la plupart des joueuses n'ont pas d'avatar, et une
// liste d'initiales grises ne distingue personne. Le logo d'équipe est une
// identité visuelle qu'elles ont déjà.
//
// UNE IMAGE PEUT ÉCHOUER, ET LA CASCADE DOIT LE SAVOIR. `next/image` ne sert
// que les hôtes de `images.remotePatterns` : un avatar hébergé ailleurs (Imgur,
// un blog…) répondait 400 via `/_next/image` et laissait une image cassée à la
// place de la joueuse. Deux gardes, qui se complètent :
//   - `next/image` seulement si `isOptimizableImageUrl` ; sinon un `<img>` nu,
//     qui ne juge pas de la provenance (même choix que `Team/TeamAvatar.tsx`).
//     Indispensable pour les avatars DÉJÀ en base sur un hôte non déclaré :
//     `/api/player/update-profile` les refuse désormais, mais ne réécrit pas
//     l'existant.
//   - un `onError` qui passe au niveau suivant de la cascade : un hôte déclaré
//     peut aussi répondre 404 (fichier supprimé, lien Discord expiré).

import { useState, type JSX } from 'react';
import Image from 'next/image';
import type { PlayerTeamIdentity } from '@/types/rating';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';

type PlayerAvatarProps = PlayerTeamIdentity & {
  avatarUrl: string | null;
  /** Libellé de la joueuse — sert d'initiales en dernier recours. */
  label: string;
  /** Côté de la vignette en pixels (carré). */
  size?: number;
  className?: string;
  /** Taille du texte des initiales (repli). */
  initialsClassName?: string;
};

export type AvatarSource = { url: string; kind: 'avatar' | 'teamLogo' };

/**
 * Première image de la cascade qui n'a pas déjà échoué, ou `null` quand il ne
 * reste que les initiales. Pure : c'est elle que teste
 * `tests/unit/playerAvatarRatingChart.test.ts`, le DOM n'étant pas disponible en test.
 */
export function pickAvatarSource(
  avatarUrl: string | null,
  teamLogoUrl: string | null,
  failed: ReadonlySet<string>
): AvatarSource | null {
  const avatar = avatarUrl?.trim();
  if (avatar && !failed.has(avatar)) return { url: avatar, kind: 'avatar' };
  const logo = teamLogoUrl?.trim();
  if (logo && !failed.has(logo)) return { url: logo, kind: 'teamLogo' };
  return null;
}

export default function PlayerAvatar({
  avatarUrl,
  teamName,
  teamLogoUrl,
  label,
  size = 32,
  className = '',
  initialsClassName = 'text-xs',
}: PlayerAvatarProps): JSX.Element {
  // Les URLs en échec, et non un compteur : si les props changent (autre
  // joueuse dans la même ligne après un tri), une nouvelle URL repart de zéro
  // sans effet de synchronisation.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const source = pickAvatarSource(avatarUrl, teamLogoUrl, failed);

  const box = `shrink-0 rounded-full object-cover ${className}`;
  const style = { width: size, height: size };

  if (source) {
    const isLogo = source.kind === 'teamLogo';
    const markFailed = () => setFailed((prev) => new Set(prev).add(source.url));
    // Le logo n'est pas la joueuse : on nomme l'équipe pour les lecteurs
    // d'écran plutôt que de laisser une image décorative ambiguë.
    const alt = isLogo ? (teamName ?? '') : '';
    const common = {
      title: isLogo ? (teamName ?? undefined) : undefined,
      className: isLogo ? `${box} bg-neutral-900 p-0.5` : box,
      style,
      onError: markFailed,
    };

    if (isOptimizableImageUrl(source.url)) {
      return (
        <Image
          // `key` : un changement de source remonte l'élément, pour qu'un
          // `onError` tardif de l'ancienne image ne marque pas la nouvelle.
          key={source.url}
          src={source.url}
          alt={alt}
          width={size}
          height={size}
          {...common}
        />
      );
    }
    return (
      // biome-ignore lint/performance/noImgElement: hôte hors `remotePatterns` — `next/image` échouerait (cf. en-tête)
      <img
        key={source.url}
        src={source.url}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        {...common}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-neutral-800 font-bold uppercase ${initialsClassName} ${className}`}
    >
      {label.trim()[0] ?? '?'}
    </span>
  );
}
