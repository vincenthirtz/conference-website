// components/admin/lazyPanel.tsx
//
// Chargement à la demande des panneaux d'onglet du back-office.
//
// Les hubs admin (Journaux, Communications, Modération, Association,
// Onboarding, Réglages, Scrims, Statistiques…) montent UN SEUL panneau à la
// fois, mais les importaient tous statiquement : ouvrir « Modération » faisait
// télécharger les cinq panneaux, dont quatre que personne ne regardait. On
// garde le panneau de l'onglet PAR DÉFAUT en import statique (il s'affiche
// immédiatement, sans skeleton) et on passe les autres par ce helper.
//
// `ssr: false` — les panneaux lisent tous leurs données après montage, via
// `useAdminFetch`, et l'admin est `noindex` : les rendre côté serveur ne
// produirait qu'un squelette de plus à hydrater.

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

/** Empreinte visuelle du panneau pendant le chargement de son chunk. */
export function PanelSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Déclare un panneau d'onglet chargé à la demande.
 *
 * À appeler au NIVEAU MODULE (comme `dynamic` lui-même), jamais dans le corps
 * d'un composant — sinon le chunk est re-résolu à chaque render.
 *
 *   const CampaignsPanel = lazyPanel(
 *     () => import('@/components/admin/communications/CampaignsPanel')
 *   );
 */
export function lazyPanel<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>
) {
  return dynamic(loader, {
    ssr: false,
    loading: () => <PanelSkeleton />,
  });
}
