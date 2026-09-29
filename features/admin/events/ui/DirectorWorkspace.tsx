// features/admin/events/ui/DirectorWorkspace.tsx — la grille de conduite du
// Director (`pages/admin/events/[runId]/director.tsx`) : timeline, édition +
// casters, comms, puis waves & stations.
//
// Sortie de la page (lot 9C, gel `adminFileSizeGuard`). Pure mise en page :
// la page garde l'état, le realtime et le câblage des panneaux (mémoïsés chez
// elle pour couper la réconciliation du tick d'une seconde) ; elle ne passe
// ici que les panneaux déjà construits.
//
// Layout desktop (lg+) : 3 colonnes 40/30/30 via grid-cols-10. Layout mobile :
// tout s'empile (Timeline → Édition → Comms → Casters). L'ordre mobile passe
// par les classes `order-*`, pas par le DOM (le DOM reste : timeline,
// édition + casters, comms — l'ordre desktop).

import type { ReactNode } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminEventDirector from '@/lib/i18n/locales/admin-fr/adminEventDirector';
import DirectorSectionTitle from './DirectorSectionTitle';

export default function DirectorWorkspace({
  timeline,
  editor,
  casters,
  composer,
  feed,
  waves,
  stations,
}: {
  timeline: ReactNode;
  editor: ReactNode;
  casters: ReactNode;
  composer: ReactNode;
  feed: ReactNode;
  waves: ReactNode;
  stations: ReactNode;
}) {
  const t = useAdminT(nsAdminEventDirector);
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
        {/* Gauche : Timeline (40%) */}
        <div className="order-1 lg:col-span-4">
          <DirectorSectionTitle note={t.dragToReorder}>
            {t.timelineHeading}
          </DirectorSectionTitle>
          {timeline}
        </div>

        {/* Centre : Édition + Casters (30%) */}
        <div className="order-2 space-y-6 lg:order-2 lg:col-span-3">
          <div>
            <DirectorSectionTitle>{t.editionHeading}</DirectorSectionTitle>
            {editor}
          </div>
          <div className="order-4 lg:order-none">
            <DirectorSectionTitle>{t.castersHeading}</DirectorSectionTitle>
            {casters}
          </div>
        </div>

        {/* Droite : Comms (30%) — composer collant + fil défilant */}
        <div className="order-3 space-y-6 lg:order-3 lg:col-span-3">
          <div>
            <DirectorSectionTitle>{t.commsHeading}</DirectorSectionTitle>
            <div className="lg:sticky lg:top-20">{composer}</div>
          </div>
          {feed}
        </div>
      </div>

      {/* Waves + Stations — regroupements logiques et postes de prod. */}
      <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-6">
        <DirectorSectionTitle>{t.wavesStationsHeading}</DirectorSectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {waves}
          {stations}
        </div>
      </div>
    </>
  );
}
