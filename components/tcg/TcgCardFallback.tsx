// components/tcg/TcgCardFallback.tsx
//
// Le visuel d'une carte TCG qui n'en a pas : le logo du site en fond (celui de
// la navbar, donc le logo d'événement du moment, cf. useSiteLogo) et
// l'initiale du nom par-dessus. Une carte n'est jamais une case vide.
//
// Partagé par la carte des joueuses (TcgCard) et le catalogue de l'admin, pour
// que les deux montrent la même chose.
//
// À poser dans un conteneur `relative` qui fixe le cadre de la carte.

import type { JSX } from 'react';
import { useSiteLogo } from '@/lib/branding/useSiteLogo';

function initial(name: string | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export default function TcgCardFallback({
  name,
  size = 'md',
}: {
  name: string | null;
  /** `sm` pour les vignettes serrées (catalogue admin). */
  size?: 'sm' | 'md';
}): JSX.Element {
  const logo = useSiteLogo();
  return (
    <>
      {/* biome-ignore lint/performance/noImgElement: logo distant possible (tenant, upload saisonnier) hors remotePatterns de next/image */}
      <img
        src={logo}
        alt=""
        loading="lazy"
        data-testid="tcg-card-logo-fallback"
        className={`absolute inset-0 h-full w-full object-contain opacity-40 ${
          size === 'sm' ? 'p-4' : 'p-6'
        }`}
      />
      <span
        aria-hidden
        className={`absolute inset-0 flex items-center justify-center font-black text-white/70 [text-shadow:0_1px_6px_rgb(0_0_0/0.6)] ${
          size === 'sm' ? 'text-3xl' : 'text-4xl'
        }`}
      >
        {initial(name)}
      </span>
    </>
  );
}
