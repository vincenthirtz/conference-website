// hooks/useCountUp.ts
//
// Compteur animé : interpole 0 → `target` avec un easing (easeOutCubic) une
// fois que `active` passe à true (typiquement branché sur useReveal). Respecte
// `prefers-reduced-motion` : la valeur finale est posée sans animation.
//
//   const { ref, revealed } = useReveal<HTMLDivElement>();
//   const value = useCountUp(42, revealed);
//   <span ref={ref}>{value}</span>
//
// `target` peut être null/undefined (état inconnu) : le hook renvoie alors 0
// et n'anime rien.

import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export function useCountUp(
  target: number | null | undefined,
  active: boolean,
  durationMs = 1400
): number {
  const safeTarget = typeof target === 'number' && isFinite(target) ? target : 0;
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    if (prefersReducedMotion() || safeTarget === 0) {
      setValue(safeTarget);
      return;
    }

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      setValue(Math.round(easeOutCubic(progress) * safeTarget));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      startRef.current = null;
    };
  }, [active, safeTarget, durationMs]);

  return value;
}
