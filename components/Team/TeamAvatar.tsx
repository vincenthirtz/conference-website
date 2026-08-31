/* eslint-disable @next/next/no-img-element */
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
// `next/image` est volontairement écarté : les logos vivent sur le stockage
// Supabase et sur le disque local, et une URL hors `remotePatterns` fait
// échouer le composant au rendu. Un `<img>` nu ne juge pas de la provenance.

import type { JSX } from 'react';

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

const SIZES = {
  xs: { box: 'h-5 w-5', text: 'text-[8px]' },
  sm: { box: 'h-8 w-8', text: 'text-[10px]' },
  md: { box: 'h-12 w-12', text: 'text-xs' },
  lg: { box: 'h-16 w-16 sm:h-20 sm:w-20', text: 'text-lg' },
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
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
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
