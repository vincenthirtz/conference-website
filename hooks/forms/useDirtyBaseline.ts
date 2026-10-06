// hooks/forms/useDirtyBaseline.ts — « le formulaire a-t-il changé depuis la
// dernière version enregistrée ? » pour les fiches d'édition faites main
// (sans `useSchemaForm`), lot A2.
//
// La page appelle `markClean(valeurs)` quand elle hydrate le formulaire depuis
// le serveur — à l'ouverture ET après chaque enregistrement réussi : c'est ce
// qui DÉSARME la garde `useUnsavedChangesGuard`. Tant que `markClean` n'a pas
// été appelé (fiche en cours de chargement), `dirty` reste faux.
//
// Comparaison par sérialisation JSON : les formulaires concernés ne portent
// que des chaînes, nombres, booléens et tableaux d'objets simples.

import { useCallback, useMemo, useState } from 'react';

export function useDirtyBaseline<T>(current: T) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const serialized = useMemo(() => JSON.stringify(current), [current]);
  const markClean = useCallback((value: T) => {
    setBaseline(JSON.stringify(value));
  }, []);
  return { dirty: baseline !== null && serialized !== baseline, markClean };
}
