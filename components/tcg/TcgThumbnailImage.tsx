// components/tcg/TcgThumbnailImage.tsx
//
// Le visuel d'une vignette de carte TCG (catalogue de l'admin) : l'image,
// servie telle quelle si son hôte échappe à l'optimiseur, sinon — absente OU
// en échec de chargement (avatar Discord changé depuis, pièce jointe expirée) —
// le même repli que la carte des joueuses (TcgCardFallback).
//
// À poser dans un conteneur `relative` qui fixe le cadre.

import Image from 'next/image';
import type { JSX } from 'react';
import TcgCardFallback, {
  revealCardFallback,
} from '@/components/tcg/TcgCardFallback';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';

export default function TcgThumbnailImage({
  url,
  name,
}: {
  url: string | null;
  name: string | null;
}): JSX.Element {
  if (!url) return <TcgCardFallback name={name} size="sm" />;
  return (
    <>
      <Image
        src={url}
        alt=""
        fill
        sizes="(min-width: 1024px) 18vw, 45vw"
        loading="lazy"
        decoding="async"
        className="object-cover"
        unoptimized={!isOptimizableImageUrl(url)}
        onError={revealCardFallback}
      />
      <span hidden className="absolute inset-0">
        <TcgCardFallback name={name} size="sm" />
      </span>
    </>
  );
}
