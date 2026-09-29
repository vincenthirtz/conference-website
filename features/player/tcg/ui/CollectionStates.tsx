// features/player/tcg/ui/CollectionStates.tsx — la collection en chargement
// (squelette) et VIDE, MAIS PAS SANS SUITE : un paquet fermé attend
// peut-être ; le dire, et y mener, vaut mieux que « gagne un match ».

import { ButtonLink, Button, Card } from '@/features/ruban';
import { Skeleton } from '@/components/ui/Skeleton';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

export function CollectionSkeleton() {
  return (
    <ul
      aria-hidden
      className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 lg:gap-3"
    >
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i}>
          <Skeleton className="aspect-[3/4] w-full" rounded="rounded-xl" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </li>
      ))}
    </ul>
  );
}

export function CollectionEmpty({
  unopenedCount,
  onGoToPacks,
}: {
  unopenedCount: number;
  onGoToPacks: () => void;
}) {
  const t = useT(nsPlayerTcg);
  return (
    <Card className="text-sm text-[var(--t2,#c7bfca)]">
      <p>
        {unopenedCount === 0
          ? t.collectionEmpty
          : unopenedCount === 1
            ? t.collectionEmptyWithPacks_one
            : format(t.collectionEmptyWithPacks_other, {
                count: unopenedCount,
              })}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {unopenedCount > 0 && (
          <Button variant="secondary" onClick={onGoToPacks}>
            {t.collectionEmptyGoToPacks}
          </Button>
        )}
        <ButtonLink href="/player/tcg-guide" variant="ghost">
          {t.collectionEmptyGuide}
        </ButtonLink>
      </div>
    </Card>
  );
}
