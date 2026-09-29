// features/player/tcg/ui/PredictionsTeaser.tsx — renvoi vers les pronostics.
// Sortis de cette page VISUELLEMENT seulement : un pronostic juste crédite
// toujours ce porte-monnaie.

import { ButtonLink, Card } from '@/features/ruban';
import { useT } from '@/lib/i18n/useT';
import nsMatchPrediction from '@/lib/i18n/locales/fr/matchPrediction';

export default function PredictionsTeaser() {
  const tp = useT(nsMatchPrediction);
  return (
    <Card
      as="section"
      className="flex flex-wrap items-center justify-between gap-4"
      aria-labelledby="tcg-predictions-teaser-title"
    >
      <div className="max-w-prose">
        <h2 id="tcg-predictions-teaser-title" className="text-lg font-semibold">
          {tp.tcgTeaserTitle}
        </h2>
        <p className="mt-1 text-sm text-[var(--t2,#c7bfca)]">
          {tp.tcgTeaserBody}
        </p>
      </div>
      <ButtonLink href="/player/pronostics" variant="secondary">
        {tp.tcgTeaserCta}
      </ButtonLink>
    </Card>
  );
}
