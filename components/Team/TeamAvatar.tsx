// components/Team/TeamAvatar.tsx
//
// La pastille d'une équipe : son logo, ou son monogramme quand elle n'en a pas.
//
// Composant partagé parce que le repli est la partie qui compte, et qu'on la
// réécrirait mal à chaque fois. Les logos fournis sont hétérogènes — photos
// JPEG, SVG blancs, PNG détourés — et une équipe sur huit n'en a pas du tout.
// Sans repli, une liste de matchs affiche un trou en face d'un logo, ce qui se
// lit comme un bug plutôt que comme une absence.
//
// `next/image` était écarté pour une raison qui tient toujours : une URL hors
// `remotePatterns` le fait ÉCHOUER AU RENDU, et les logos sont fournis par les
// équipes — un `<img>` nu, lui, ne juge pas de la provenance.
//
// Mais le prix était lourd : un logo de 757 Kio servi tel quel dans une
// pastille de 64 px (Lighthouse du 16 septembre 2026, 1,4 Mio d'images
// surdimensionnées sur la seule page d'accueil). On garde donc les deux —
// optimisation quand l'hôte est déclaré, `<img>` sinon. Le repli reste la
// garantie, il cesse d'être le cas général.

import type { JSX } from 'react';
import Image from 'next/image';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';

/** Monogramme de repli : le nom court, sinon les initiales du nom. */
export function teamMonogram(team: {
  name: string;
  shortName?: string | null;
}): string {
  const short = (team.shortName ?? '').trim();
  if (short) return short.slice(0, 4).toUpperCase();
  const initials = team.name
    .trim()
    .split(/[\s'’-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  return (initials || team.name.slice(0, 2)).slice(0, 3).toUpperCase();
}

/**
 * `sizes` accompagne chaque taille : sans lui, `fill` fait télécharger une
 * image calibrée pour la largeur de l'écran — soit exactement le gâchis qu'on
 * corrige. Les valeurs suivent `box`, au point de rupture le plus large.
 */
const SIZES = {
  xs: { box: 'h-5 w-5', text: 'text-[8px]', sizes: '20px' },
  sm: { box: 'h-8 w-8', text: 'text-[10px]', sizes: '32px' },
  md: { box: 'h-12 w-12', text: 'text-xs', sizes: '48px' },
  lg: {
    box: 'h-16 w-16 sm:h-20 sm:w-20',
    text: 'text-lg',
    sizes: '(min-width: 640px) 80px, 64px',
  },
} as const;

export default function TeamAvatar({
  name,
  shortName = null,
  logoUrl = null,
  size = 'sm',
  className = '',
}: {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}): JSX.Element {
  const s = SIZES[size];
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-base)] ring-1 ring-inset ring-white/10 ${s.box} ${className}`}
      // Décoratif : le nom de l'équipe est toujours écrit à côté. Le doubler
      // ferait lire deux fois la même chose à un lecteur d'écran.
      aria-hidden="true"
    >
      {logoUrl ? (
        isOptimizableImageUrl(logoUrl) ? (
          // Le parent est déjà `relative`, dimensionné et `overflow-hidden` :
          // `fill` s'y substitue sans rien changer à la mise en page.
          <Image
            src={logoUrl}
            alt=""
            fill
            sizes={s.sizes}
            loading="lazy"
            className="object-cover"
          />
        ) : (
          // Hôte non déclaré : l'optimiseur refuserait, on sert tel quel.
          // biome-ignore lint/performance/noImgElement: repli assumé, cf. l'en-tête
          <img
            src={logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <span
          className={`bg-gradient-to-br from-[var(--color-violet-light)] to-[var(--color-green-light)] bg-clip-text font-extrabold tracking-tight text-transparent ${s.text}`}
        >
          {teamMonogram({ name, shortName })}
        </span>
      )}
    </span>
  );
}
