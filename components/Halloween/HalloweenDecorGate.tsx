// components/Halloween/HalloweenDecorGate.tsx
//
// Monte la décoration d'Halloween quand c'est la saison (config/halloweenDecor).
//
// Petite porte statique devant un composant paresseux : hors période, le
// navigateur ne télécharge même pas les dessins. La date se lit au montage,
// côté client — les pages sont en ISR, une date lue au rendu serveur resterait
// figée dans le HTML en cache.

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { halloweenDecor, isHalloweenDecorOn } from '@/config/halloweenDecor';
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';

const HalloweenDecor = dynamic(() => import('./HalloweenDecor'), {
  ssr: false,
});

export default function HalloweenDecorGate() {
  // Marque blanche : un autre organisateur n'a pas à hériter des citrouilles
  // de la Women's Cup (même règle que le pulse du logo dans la Navbar).
  const branding = useTenantBranding();
  const [inSeason, setInSeason] = useState(false);

  useEffect(() => {
    setInSeason(isHalloweenDecorOn(halloweenDecor, Date.now()));
  }, []);

  if (branding || !inSeason) return null;
  return <HalloweenDecor />;
}
