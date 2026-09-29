// features/admin/_shared/useHydrateOnce.ts — remplit un formulaire d'édition
// depuis une lecture en cache, UNE fois par fiche (lot L10).
//
// POURQUOI. Une fiche `[id]` copie la réponse du serveur dans l'état du
// formulaire. Si la copie se refaisait à chaque nouvelle donnée (relecture,
// `setQueryData` après un enregistrement), elle écraserait la saisie en
// cours. Le booléen rendu dit « formulaire prêt » : la page garde son écran
// de chargement jusque-là, sans un rendu intermédiaire à champs vides.

import { useEffect, useRef, useState } from 'react';

export function useHydrateOnce<T>(
  id: string | null,
  data: T | undefined,
  hydrate: (data: T) => void
): boolean {
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const hydrateRef = useRef(hydrate);
  hydrateRef.current = hydrate;

  useEffect(() => {
    if (data === undefined || !id || hydratedId === id) return;
    hydrateRef.current(data);
    setHydratedId(id);
  }, [data, id, hydratedId]);

  return !!id && hydratedId === id;
}
