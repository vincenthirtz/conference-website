// features/admin/simulator/ui/SimulatorHeader.tsx — en-tête du simulateur de
// tournoi : titre, sous-titre et bascule formulaire dense / quiz guidé.
// Présentationnel : la page porte le mode courant.

import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import type { SimulatorDict } from '../hooks/simulatorHookTypes';
import { simSegmentClass } from './simulatorClasses';

export default function SimulatorHeader({
  tx,
  viewMode,
  onViewMode,
}: {
  tx: SimulatorDict;
  viewMode: 'form' | 'slides';
  onViewMode: (mode: 'form' | 'slides') => void;
}) {
  return (
    <AdminPageHeader
      title={tx.heading}
      subtitle={tx.subtitle}
      actions={
        // Mode toggle: dense form vs guided quiz/slides
        <div
          role="group"
          aria-label={tx.viewModeLabel}
          className="flex overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] print:hidden"
        >
          <button
            type="button"
            onClick={() => onViewMode('form')}
            aria-pressed={viewMode === 'form'}
            className={simSegmentClass(viewMode === 'form')}
          >
            {tx.formModeToggle}
          </button>
          <button
            type="button"
            onClick={() => onViewMode('slides')}
            aria-pressed={viewMode === 'slides'}
            className={`${simSegmentClass(viewMode === 'slides')} border-l border-[var(--line2,rgba(194,196,201,.2))]`}
          >
            ✨ {tx.quizModeToggle}
          </button>
        </div>
      }
    />
  );
}
