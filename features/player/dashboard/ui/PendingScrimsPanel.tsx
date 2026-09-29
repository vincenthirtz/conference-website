// features/player/dashboard/ui/PendingScrimsPanel.tsx — les scrims qui
// attendent MA réponse (négociation multi-créneaux). Porte l'ancre du bandeau
// « à faire » (item `scrims`). Ne rend rien quand la liste est vide.

import { memo } from 'react';
import ScrimNegotiationCard, {
  type PendingScrim,
  type ScrimAction,
  type ScrimActionPayload,
} from '@/components/player/ScrimNegotiationCard';
import { Card, Chip } from '@/features/ruban';
import type nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';
import { DASHBOARD_ANCHORS } from '@/utils/player/dashboardAnchors';

function PendingScrimsPanel({
  scrims,
  busyId,
  error,
  locale,
  t,
  onAction,
}: {
  scrims: PendingScrim[];
  busyId: string | null;
  error: string | null;
  locale: string;
  t: typeof nsPlayerIndex.fr;
  /** `undefined` en lecture seule (inspection). */
  onAction?: (
    demandeId: string,
    action: ScrimAction,
    payload?: ScrimActionPayload
  ) => void;
}) {
  if (scrims.length === 0) return null;
  return (
    <Card
      id={DASHBOARD_ANCHORS.pendingScrims}
      className="scroll-mt-24"
      as="section"
    >
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        {t.pendingScrims}
        <Chip tone="brand">{scrims.length}</Chip>
      </h3>
      {error && (
        <p role="alert" className="mb-3 text-xs text-red-100">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {scrims.map((scrim) => (
          <ScrimNegotiationCard
            key={scrim.id}
            scrim={scrim}
            busy={busyId === scrim.id}
            locale={locale}
            t={t}
            onAction={onAction}
          />
        ))}
      </div>
    </Card>
  );
}

export default memo(PendingScrimsPanel);
