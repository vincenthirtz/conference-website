// features/player/library/ui/teamHq/TeamHqLogo.tsx — le logo d'une équipe dans
// la porte et le panneau des QG (lot 9 de docs/PLAN-womens-library.md).
// `next/image` quand l'hôte est déclaré, `<img>` sinon : un hôte non déclaré
// ferait échouer `next/image` au rendu (cf. features/player/team/ui/
// TeamHeaderBlock.tsx).

import Image from 'next/image';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';

export default function TeamHqLogo({
  src,
  alt,
  size = 40,
}: {
  src: string | null;
  alt: string;
  size?: number;
}) {
  if (!src) return null;
  const className =
    'shrink-0 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1b1320)] object-cover';
  return isOptimizableImageUrl(src) ? (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
    />
  ) : (
    // biome-ignore lint/performance/noImgElement: hôte hors `remotePatterns`, `next/image` échouerait
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      className={className}
    />
  );
}
