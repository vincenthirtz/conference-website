// features/player/_shared/ui/ActionDock.tsx — la barre d'action « en bas du
// pouce » des archétypes joueuse (lot P8). Collante au-dessus de la
// navigation basse (`--player-nav-offset`, posé par styles/player-ruban.css
// quand la coquille est montée), simple rangée à partir de `lg`.
//
// Pas une brique : une mise en page qui reçoit des `Button` / `ButtonLink` du
// kit features/ruban.

import { useEffect, type ReactNode } from 'react';

export default function ActionDock({ children }: { children: ReactNode }) {
  return (
    <div
      data-action-dock=""
      className="sticky bottom-[calc(var(--player-nav-offset,0px)+0.75rem)] z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line,rgba(194,196,201,.12))] bg-[var(--canvas,#07030a)]/95 px-4 py-3 backdrop-blur-xl lg:static lg:mx-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none [&>*]:grow lg:[&>*]:grow-0"
    >
      {children}
    </div>
  );
}

/** Échap ferme une feuille / une vue plein écran ouverte. */
export function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}
