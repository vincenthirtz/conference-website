// features/player/tcg/ui/TcgLibraryTile.tsx — la porte de la Women's Library
// depuis « Ma collection » (lot 4 de docs/PLAN-womens-library.md).
// Présentationnel : un titre, une phrase, un lien.
//
// SOUS L'HISTORIQUE DES PIÈCES : c'est là qu'on se demande à quoi elles
// servent, et la boutique de meubles est leur nouveau débouché.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { Card } from '@/features/ruban';

export default function TcgLibraryTile() {
  const t = useT(nsPlayerTcg);
  return (
    <Card as="section" padding="sm" aria-labelledby="tcg-library-tile">
      <h2
        id="tcg-library-tile"
        className="font-[family-name:var(--fd,Archivo,sans-serif)] text-lg font-bold text-[var(--t1,#f4edf7)]"
      >
        {t.libraryTileTitle}
      </h2>
      <p className="mt-1 text-sm text-[var(--t2,#c7bfca)]">
        {t.libraryTileBody}
      </p>
      <Link
        prefetch={false}
        href="/player/library"
        className="mt-3 inline-block text-sm font-medium text-[var(--or-300,#dea3f6)] underline-offset-4 transition hover:text-[var(--or-200,#eec4ff)] hover:underline"
      >
        {t.libraryTileLink}
      </Link>
    </Card>
  );
}
