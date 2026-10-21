// features/player/library/ui/room/PostureBar.tsx — sous la scène, ce que fait
// la joueuse d'un meuble (lot 15) : « Tu es assise. », « Tu lis. »… et le
// bouton pour se relever (« Se lever ») ou arrêter (« Arrêter »), atteignable
// au clavier. La phrase est une région `status` toujours présente : un lecteur
// d'écran l'annonce à chaque changement, et rien ne s'affiche debout.

import { useT } from '@/lib/i18n/useT';
import nsFurniture from '@/lib/i18n/locales/fr/playerLibraryFurniture';
import { Button } from '@/features/ruban';
import type { PlayerPosture } from '../../engine/postures';

export default function PostureBar({
  posture,
  onStandUp,
}: {
  posture: PlayerPosture | null;
  onStandUp: () => void;
}) {
  const t = useT(nsFurniture);
  const what = !posture
    ? null
    : posture.kind === 'use'
      ? posture.activity
      : posture.pose === 'lie'
        ? 'lie'
        : 'sit';
  return (
    <div
      data-testid="library-posture"
      data-posture={what ?? ''}
      className={`flex flex-wrap items-center gap-3 ${posture ? 'mt-3' : ''}`}
    >
      <p role="status" className="text-sm text-[var(--t2,#c7bfca)]">
        {what ? t.status[what] : ''}
      </p>
      {posture && (
        <Button variant="secondary" size="sm" onClick={onStandUp}>
          {posture.kind === 'use' ? t.stop : t.standUp}
        </Button>
      )}
    </div>
  );
}
