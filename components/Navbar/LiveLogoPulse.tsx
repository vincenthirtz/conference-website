// components/Navbar/LiveLogoPulse.tsx
//
// Le pulse de la charte autour du logo de la navbar, TANT QUE la chaîne
// `womens_cup` est en direct. Le rendu lui-même vit dans
// `components/brand/PulseCanvas` — il sert aussi de source OBS autonome, où il
// tourne sans condition (`/overlay/logo`).
//
// Ici, une seule décision : faut-il l'afficher ?

import { useEffect, useState } from 'react';
import { useTwitchLive } from '@/components/Home/useTwitchLive';
import PulseCanvas, {
  prefersReducedMotion,
} from '@/components/brand/PulseCanvas';

export { PULSE_SOURCES, keyOutBlack } from '@/components/brand/PulseCanvas';

/**
 * À poser dans un conteneur `relative` qui contient le logo. Ne rend rien tant
 * que la chaîne n'est pas en direct, ni si l'utilisateur limite les animations.
 */
export default function LiveLogoPulse() {
  const { live } = useTwitchLive();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  if (!live || reducedMotion) return null;
  // Centré sur le logo (64 px) : les crochets l'encadrent à ~45 px de part et
  // d'autre du centre — assez près pour que le crochet gauche reste à l'écran
  // quand le logo colle au bord (gouttière de 16 px, ≤ 1280 px).
  return (
    <PulseCanvas testId="nav-logo-live-pulse" className="h-[88px] w-[128px]" />
  );
}
