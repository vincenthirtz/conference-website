// features/player/tcg/hooks/useAnnouncer.ts — région `aria-live` montée VIDE
// en permanence : vider d'abord, sinon un texte identique au précédent ne
// serait pas relu.

import { useCallback, useState } from 'react';

export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);
  return { announcement, announce };
}
