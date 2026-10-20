// features/player/library/ui/places/PlaceDialog.tsx — le cadre des panneaux
// du hall (lot 7 de docs/PLAN-womens-library.md) : le panneau d'annonces, la
// liste des appartements ouverts, la porte des QG.
//
// DIALOGUE MODAL, comme le signalement (`ui/social/ReportDialog`) et les
// rayonnages de la salle de lecture : `role="dialog"`, `aria-modal`, nommé par
// le titre de son contenu (`labelledBy`) ; « Fermer » en tête reçoit le focus,
// Tab tourne dedans, Échap ferme, le focus revient au déclencheur. Rendu dans
// `document.body`. Un seul panneau ouvert à la fois (l'écran du hall le
// garantit) : un contenu à id fixe (la porte des QG) n'est jamais en double.

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { Button } from '@/features/ruban';
import {
  focusInitial,
  SURFACE,
  trapTab,
  useReturnFocus,
} from '../social/shared';

export type PlaceDialogProps = {
  /** L'id du titre que porte le contenu. */
  labelledBy: string;
  /** Repère pour les tests et le style (`data-place-panel`). */
  panel: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export default function PlaceDialog({
  labelledBy,
  panel,
  onClose,
  returnFocusRef,
  children,
}: PlaceDialogProps) {
  const t = useT(nsHall);
  const panelRef = useRef<HTMLDivElement>(null);

  useReturnFocus(returnFocusRef);

  useEffect(() => {
    focusInitial(panelRef.current);
  }, [panel]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    trapTab(e, panelRef.current);
  };

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-place-panel={panel}
        onKeyDown={onKey}
        className={`max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto p-5 sm:p-6 ${SURFACE}`}
      >
        <div className="mb-2 flex justify-end">
          <Button size="sm" data-autofocus onClick={onClose}>
            {t.dialog.close}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );

  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.body);
}
