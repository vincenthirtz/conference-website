// components/tcg/cardImageOptimize.ts — sorti tel quel de `TcgCard.tsx` (lot 11
// de docs/PLAN-tcg-2.md) pour que le composant reste sous le plafond de taille
// de l'espace joueuse (`playerFileSizeGuard`) en accueillant la ligne de
// chiffres. `TcgCard` le réexporte : les appelants n'ont rien à changer.

import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';

/**
 * L'image de la carte peut-elle passer par l'optimiseur de Next ?
 *
 * POURQUOI CE N'EST PAS « TOUJOURS ». `/player/tcg` affiche 40 cartes d'un
 * coup, et une photo consentie peut peser 2 Mio : servie brute dans une
 * vignette de 180 px, c'est toute la collection qui descend en pleine
 * résolution sur un téléphone en 4G. Mais l'ancien `unoptimized`
 * inconditionnel avait une raison réelle : une carte d'ÉQUIPE sans
 * illustration affiche le LOGO, dont l'URL est fournie par l'équipe et peut
 * viser n'importe quel hôte — et `next/image` ÉCHOUE AU RENDU hors
 * `remotePatterns`. D'où l'arbitrage partagé `isOptimizableImageUrl` (même
 * choix que `Team/TeamAvatar.tsx`).
 *
 * LE SVG RESTE SERVI TEL QUEL. Les maquettes de maps sont des SVG locaux
 * (`readMapFaces`) : l'optimiseur n'a rien à réduire dans un vectoriel et le
 * renverrait inchangé — mais depuis une fonction serveur plutôt que le fichier
 * statique en cache, et sous une URL distincte par largeur du `srcset`. Pure
 * perte, et 40 cartes de maps d'un coup dans une collection.
 *
 * Exportée pour être testée sans DOM.
 */
export function shouldOptimizeCardImage(
  url: string | null | undefined
): boolean {
  if (!isOptimizableImageUrl(url)) return false;
  // Le chemin seul : un `?v=` de cache ne doit pas masquer l'extension.
  const path = (url ?? '').trim().split(/[?#]/)[0].toLowerCase();
  return !path.endsWith('.svg');
}
