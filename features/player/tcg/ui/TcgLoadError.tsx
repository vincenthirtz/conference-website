// features/player/tcg/ui/TcgLoadError.tsx — la lecture a échoué. UNE LECTURE
// RATÉE N'EST PAS UNE COLLECTION VIDE : on le dit, avec de quoi réessayer.

import { Button, Card } from '@/features/ruban';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

export default function TcgLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useT(nsPlayerTcg);
  return (
    <Card as="section" role="alert" className="mb-6">
      <h2 className="text-lg font-semibold">{t.loadErrorTitle}</h2>
      <p className="mt-1 max-w-prose text-sm text-[var(--t2,#c7bfca)]">
        {t.loadErrorBody}
      </p>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        {t.retry}
      </Button>
    </Card>
  );
}
