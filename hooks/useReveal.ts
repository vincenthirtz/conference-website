// hooks/useReveal.ts
//
// Scroll-reveal léger et sans dépendance : un IntersectionObserver révèle
// l'élément la première fois qu'il entre dans le viewport, puis se déconnecte
// (one-shot — pas de re-trigger au scroll retour). Respecte
// `prefers-reduced-motion` : dans ce cas l'élément est considéré visible
// immédiatement (aucune animation d'entrée).
//
//   const { ref, revealed } = useReveal<HTMLDivElement>();
//   <div ref={ref} data-revealed={revealed}> … </div>
//
// Le style d'entrée (opacity/translate + transition) est porté par la classe
// utilitaire `.reveal` de globals.css, pilotée par l'attribut
// `data-revealed`. Ce hook ne fait que basculer le flag.

import { useEffect, useRef, useState } from 'react';

type UseRevealOptions = {
  /** Marge du root observer (avance/retarde le déclenchement). */
  rootMargin?: string;
  /** Fraction visible requise avant révélation. */
  threshold?: number;
  /** Désactive l'observation (révélé d'emblée). */
  disabled?: boolean;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>({
  rootMargin = '0px 0px -10% 0px',
  threshold = 0.15,
  disabled = false,
}: UseRevealOptions = {}) {
  const ref = useRef<T | null>(null);
  // SSR + reduced-motion : visible immédiatement pour ne rien casser.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (disabled || prefersReducedMotion() || !('IntersectionObserver' in window)) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold, disabled]);

  return { ref, revealed };
}
