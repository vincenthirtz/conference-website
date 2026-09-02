// components/News/ArticleHero.tsx
//
// L'illustration en tête d'un article — sans jamais la décapiter.
//
// LE DÉFAUT CORRIGÉ. La page forçait toute image dans un cadre 1200×630 en
// `object-cover`, sauf si `resolveNewsImage` la déclarait « logo ». Or ce
// verdict repose sur une convention de DOSSIER (`public/img/logos/`), qui ne
// couvre pas les images téléversées : le logo carré de l'association, publié
// depuis le panneau Réseaux, s'est retrouvé recadré en bandeau, ailes coupées
// en haut et en bas.
//
// LA RÈGLE ICI ne dépend d'aucune convention : on mesure les proportions
// RÉELLES au chargement. Une image large est un bandeau, elle remplit le cadre ;
// tout le reste est présenté en entier sur un fond discret.
//
// L'état initial est `contain`. Tant qu'on ne sait pas, le pire qu'il puisse
// arriver est une image entourée de vide — jamais une image amputée.

import Image from 'next/image';
import { useState } from 'react';
import type { JSX } from 'react';

/**
 * Au-delà de ce rapport largeur/hauteur, l'image est traitée comme un bandeau.
 * 1,6 laisse passer le 16/9 (1,78) et le 1200×630 (1,90), et exclut le carré
 * comme le 4/3 — les formats sous lesquels arrivent les logos.
 */
const BANNER_RATIO = 1.6;

export default function ArticleHero({
  src,
  alt,
  /** Verdict du serveur : force le cadrage entier, sans attendre la mesure. */
  forceContain = false,
}: {
  src: string;
  alt: string;
  forceContain?: boolean;
}): JSX.Element {
  const [isBanner, setIsBanner] = useState(false);
  const contain = forceContain || !isBanner;

  return (
    <div
      className={`relative mt-4 w-full overflow-hidden rounded-2xl border border-white/10 ${
        contain ? 'bg-white/[0.03]' : ''
      }`}
    >
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={630}
        priority
        sizes="(max-width:768px) 100vw, 736px"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (!img.naturalHeight) return;
          setIsBanner(img.naturalWidth / img.naturalHeight >= BANNER_RATIO);
        }}
        className={`h-full max-h-[420px] w-full ${
          contain ? 'object-contain p-6 sm:p-8' : 'object-cover'
        }`}
      />
    </div>
  );
}
