// features/admin/_shared/queue/WaitingChip.tsx — puce « en attente depuis X h/j »
// d'une file de traitement, colorée selon l'ancienneté (cf. ../waitingAge.ts).
//
// L'heure courante n'est lue qu'APRÈS le montage : une liste rendue côté
// serveur (/admin/demandes) afficherait sinon un écart serveur/navigateur au
// passage d'une heure pleine, donc une erreur d'hydratation. Elle se relit
// toutes les cinq minutes pour qu'un onglet laissé ouvert ne mente pas.

import { useEffect, useState } from 'react';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  formatWaitingAge,
  type WaitingLabels,
  waitingAge,
} from '@/features/admin/_shared/waitingAge';

const REFRESH_MS = 5 * 60_000;

export default function WaitingChip({
  since,
  labels,
  title,
}: {
  /** Début de l'attente (ISO), en général `created_at`. */
  since: string | null | undefined;
  labels: WaitingLabels;
  title?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;
  const age = waitingAge(since, now);
  if (!age) return null;
  return (
    <Chip tone={age.tone} title={title} data-testid="waiting-age">
      {formatWaitingAge(age, labels)}
    </Chip>
  );
}
