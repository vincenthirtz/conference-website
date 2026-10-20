// features/player/library/ui/readingRoom/ReadingDialog.tsx — le cadre d'un
// panneau de lecture de la Grande salle de lecture (lot 8 de
// docs/PLAN-womens-library.md) : un rayonnage, ou le guichet ouvert depuis la
// vue.
//
// DIALOGUE MODAL, comme le signalement (`ui/social/ReportDialog`) :
// `role="dialog"`, `aria-modal`, nommé par le titre de son contenu
// (`labelledBy`) ; « Fermer » en tête reçoit le focus (on lit ensuite de haut
// en bas), Tab tourne dedans, le focus revient au déclencheur. Rendu dans
// `document.body`.
//
// ÉCHAP FERME, SANS ÊTRE AVALÉ : l'appui continue jusqu'à la sortie rapide
// (`SafetyQuickExit`, Échap ×2), qui marche donc AUSSI panneau ouvert. Le
// premier appui ferme, le second, aussitôt, quitte la Library.

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/lib/i18n/useT';
import nsReadingRoom from '@/lib/i18n/locales/fr/playerLibraryReadingRoom';
import { Button } from '@/features/ruban';
import {
  focusInitial,
  SURFACE,
  trapTab,
  useReturnFocus,
} from '../social/shared';

export type ReadingDialogProps = {
  /** L'id du titre (`h2`) que porte le contenu. */
  labelledBy: string;
  /** Repère pour les tests et le style (`data-reading-panel`). */
  panel: string;
  onClose: () => void;
  /** Sous le contenu : le lien vers /securite, s'il y en a un. */
  footer?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export default function ReadingDialog({
  labelledBy,
  panel,
  onClose,
  footer,
  returnFocusRef,
  children,
}: ReadingDialogProps) {
  const t = useT(nsReadingRoom);
  const panelRef = useRef<HTMLDivElement>(null);

  useReturnFocus(returnFocusRef);

  useEffect(() => {
    focusInitial(panelRef.current);
  }, [panel]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      // PAS de stopPropagation : la sortie rapide compte cet appui.
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
        data-reading-panel={panel}
        onKeyDown={onKey}
        className={`max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto p-5 sm:p-6 ${SURFACE}`}
      >
        <div className="mb-2 flex justify-end">
          <Button size="sm" data-autofocus onClick={onClose}>
            {t.shelves.close}
          </Button>
        </div>
        {children}
        {footer ? (
          <div className="mt-6 border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.body);
}
