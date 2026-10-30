// components/Halloween/HalloweenOverlayDecorGate.tsx
//
// Monte la décoration d'Halloween dans un overlay OBS, quand c'est permis :
// la saison (config/halloweenDecor, comme la page d'accueil), l'URL (`?halloween=0`
// la retire de cette source), l'organisateur et la taille de la source.
//
// CETTE SOURCE PASSE À L'ANTENNE : une panne de la décoration ne doit jamais
// emporter l'overlay. Les dessins sont un chunk à part (ni dans le premier
// chargement de la page, ni téléchargés hors saison) ; un chunk qui ne se charge
// pas ne rend rien (`loading`) ; et tout ce qui lève ici s'arrête à une barrière
// muette — l'ErrorBoundary de `_app`, lui, afficherait son message à l'écran.
//
// La date se relit chaque minute : une source OBS reste ouverte des heures, et
// doit se retirer d'elle-même à la fin de la saison sans être rechargée.

import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useState } from 'react';
import { halloweenDecor, isHalloweenDecorOn } from '@/config/halloweenDecor';
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';
import {
  frameFitsHalloweenLevel,
  type HalloweenOverlayLevel,
  urlAllowsHalloween,
} from './halloweenOverlayLevels';

const HalloweenOverlayDecor = dynamic(() => import('./HalloweenOverlayDecor'), {
  ssr: false,
  loading: () => null,
});

const RECHECK_MS = 60_000;

class SilentBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Gate({ level }: { level: HalloweenOverlayLevel }) {
  const branding = useTenantBranding();
  const [allowed, setAllowed] = useState(false);

  // Côté client seulement : le HTML du serveur ne porte rien, donc aucun écart
  // d'hydratation.
  useEffect(() => {
    const check = () =>
      setAllowed(
        isHalloweenDecorOn(halloweenDecor, Date.now()) &&
          urlAllowsHalloween(window.location.search) &&
          frameFitsHalloweenLevel(level, window.innerWidth, window.innerHeight)
      );
    check();
    const timer = setInterval(check, RECHECK_MS);
    return () => clearInterval(timer);
  }, [level]);

  if (branding || !allowed) return null;
  return <HalloweenOverlayDecor level={level} />;
}

export default function HalloweenOverlayDecorGate({
  level,
}: {
  /** `null` : pas de décoration sur cette source (./halloweenOverlayLevels). */
  level: HalloweenOverlayLevel | null;
}) {
  if (!level) return null;
  return (
    <SilentBoundary>
      <Gate level={level} />
    </SilentBoundary>
  );
}
