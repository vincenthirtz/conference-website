// features/admin/moderation/hooks/useCommentSelection.ts — sélection des
// commentaires de la page courante pour les actions en masse
// (components/admin/moderation/CommentsPanel.tsx).
//
// La sélection ne survit pas à un changement de page ou de filtre : une
// action en masse ne doit viser que ce qui est sous les yeux.

import { useEffect, useMemo, useState } from 'react';

export function useCommentSelection(rows: ReadonlyArray<{ id: string }>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => pageIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pageIds]);

  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  return {
    selected,
    allSelected,
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () => setSelected(allSelected ? new Set() : new Set(pageIds)),
    clear: () => setSelected(new Set()),
  };
}
