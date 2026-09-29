// features/player/tcg/ui/trades/TradeBoxTabs.tsx — reçues / envoyées,
// ouvertes / closes : deux groupes de boutons pressés (état lu par les
// lecteurs d'écran), sous le titre de la boîte.

import { Button } from '@/features/ruban';
import { useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import type { Box, ListState } from '../../tradeModel';

export default function TradeBoxTabs({
  box,
  listState,
  onBox,
  onState,
}: {
  box: Box;
  listState: ListState;
  onBox: (box: Box) => void;
  onState: (state: ListState) => void;
}) {
  const t = useT(nsTcgTrade);
  const tab = (active: boolean, label: string, onClick: () => void) => (
    <Button
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
  );
  return (
    <section aria-labelledby="trade-box-title" className="mb-4 mt-8">
      <h2 id="trade-box-title" className="text-lg font-semibold">
        {t.boxLabel}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <div className="flex gap-1" role="group" aria-label={t.boxLabel}>
          {tab(box === 'received', t.boxReceived, () => onBox('received'))}
          {tab(box === 'sent', t.boxSent, () => onBox('sent'))}
        </div>
        <div className="flex gap-1" role="group">
          {tab(listState === 'open', t.stateOpen, () => onState('open'))}
          {tab(listState === 'closed', t.stateClosed, () => onState('closed'))}
        </div>
      </div>
    </section>
  );
}
