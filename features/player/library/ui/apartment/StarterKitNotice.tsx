// features/player/library/ui/apartment/StarterKitNotice.tsx — le mot
// d'accueil du kit de bienvenue (lot 14d de docs/PLAN-womens-library.md).
//
// UNE FOIS. L'API ne rend `starterKit` que sur la lecture de l'appartement qui
// vient d'offrir le kit. `useStarterKitGrant` le RETIENT ici le temps de le
// dire (une relecture de l'appartement ne l'efface pas), le RETIRE du cache
// (revenir sur la page ne le redit pas) et RELIT `me` : l'inventaire, lu avant
// le don, ne contenait pas encore les meubles offerts.
//
// CALME : un encadré dans la page, fermé d'un clic, annoncé poliment
// (`role="status"`), sans toast ni animation.

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { Button } from '@/features/ruban';
import { usePlayerScope } from '../../../_shared/query';
import { libraryKeys } from '../../hooks/useLibraryHome';
import { furnitureName } from '../../model';
import type {
  LibraryApartmentViewResponse,
  LibraryStarterKitGrant,
} from '../../responses';

export function useStarterKitGrant(
  apartment: LibraryApartmentViewResponse | null
) {
  const qc = useQueryClient();
  const scope = usePlayerScope();
  const [grant, setGrant] = useState<LibraryStarterKitGrant | null>(null);
  const incoming = apartment?.starterKit ?? null;

  useEffect(() => {
    if (!incoming) return;
    setGrant(incoming);
    qc.setQueryData<LibraryApartmentViewResponse>(
      libraryKeys.apartment(scope),
      (prev) => {
        if (!prev?.starterKit) return prev;
        const { starterKit: _said, ...rest } = prev;
        return rest;
      }
    );
    void qc.invalidateQueries({ queryKey: libraryKeys.me(scope) });
  }, [incoming, qc, scope]);

  return { grant, dismiss: useCallback(() => setGrant(null), []) };
}

export default function StarterKitNotice({
  grant,
  onDismiss,
}: {
  grant: LibraryStarterKitGrant;
  onDismiss: () => void;
}) {
  const t = useT(nsPlayerLibrary);
  const titleId = useId();
  const names = t.furniture as Readonly<Record<string, string>>;
  const items = grant.keys.map((key) => furnitureName(names, key)).join(', ');

  return (
    <section
      role="status"
      aria-labelledby={titleId}
      data-testid="library-starter-kit"
      className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] p-3 text-sm"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={titleId} className="font-bold text-[var(--t1,#f4edf7)]">
          {t.starterKitTitle}
        </h2>
        <p className="text-[var(--t2,#c7bfca)]">
          {format(t.starterKitItems, { items })}
        </p>
        <p className="text-[var(--t3,#a39ba6)]">
          {grant.placed ? t.starterKitPlaced : t.starterKitStored}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onDismiss}>
        {t.starterKitDismiss}
      </Button>
    </section>
  );
}
