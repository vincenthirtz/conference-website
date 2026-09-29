// features/admin/simulator/ui/SimulatorToolbar.tsx — barre d'actions d'une
// simulation générée : round suivant, animation, tout simuler, reset,
// annuler/refaire, puis sauvegarde, création du tournoi, copie et PDF.
// Présentationnel : chaque bouton appelle le handler reçu de la page.

import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { SimulatorDict } from '../hooks/simulatorHookTypes';

export default function SimulatorToolbar({
  tx,
  animating,
  creatingTournament,
  undoCount,
  redoCount,
  onNextRound,
  onAnimated,
  onSimulateAll,
  onResetAll,
  onUndo,
  onRedo,
  onSaveHistory,
  onCreateTournament,
  onCopyResults,
  onPrint,
}: {
  tx: SimulatorDict;
  animating: boolean;
  creatingTournament: boolean;
  undoCount: number;
  redoCount: number;
  onNextRound: () => void;
  onAnimated: () => void;
  onSimulateAll: () => void;
  onResetAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveHistory: () => void;
  onCreateTournament: () => void;
  onCopyResults: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <AdminButton
        variant="secondary"
        size="sm"
        onClick={onNextRound}
        title={tx.nextRoundTitle}
      >
        {tx.nextRound}
      </AdminButton>
      <AdminButton
        variant={animating ? 'danger' : 'secondary'}
        size="sm"
        onClick={onAnimated}
        className={animating ? 'animate-pulse' : ''}
        title={animating ? tx.animatedStopTitle : tx.animatedStartTitle}
      >
        {animating ? tx.stop : tx.simulateAnimated}
      </AdminButton>
      <AdminButton variant="primary" size="sm" onClick={onSimulateAll}>
        {tx.simulateAll}
      </AdminButton>
      <AdminButton variant="danger" size="sm" onClick={onResetAll}>
        {tx.resetAll}
      </AdminButton>
      <AdminButton
        variant="ghost"
        size="sm"
        onClick={onUndo}
        disabled={undoCount === 0}
        title={format(tx.undoTitle, { count: undoCount })}
        aria-label={format(tx.undoTitle, { count: undoCount })}
      >
        &#x21A9;
      </AdminButton>
      <AdminButton
        variant="ghost"
        size="sm"
        onClick={onRedo}
        disabled={redoCount === 0}
        title={format(tx.redoTitle, { count: redoCount })}
        aria-label={format(tx.redoTitle, { count: redoCount })}
      >
        &#x21AA;
      </AdminButton>
      <div
        aria-hidden
        className="mx-1 h-6 w-px bg-[var(--line2,rgba(194,196,201,.2))] print:hidden"
      />
      <AdminButton
        variant="ghost"
        size="sm"
        onClick={onSaveHistory}
        className="print:hidden"
        title={tx.saveHistoryTitle}
      >
        {tx.save}
      </AdminButton>
      <AdminButton
        variant="secondary"
        size="sm"
        onClick={onCreateTournament}
        disabled={creatingTournament}
        className={`print:hidden ${creatingTournament ? 'cursor-wait' : ''}`}
        title={tx.createTournamentTitle}
      >
        {creatingTournament ? tx.creating : tx.createTournament}
      </AdminButton>
      <AdminButton
        variant="ghost"
        size="sm"
        onClick={onCopyResults}
        className="print:hidden"
        title={tx.copyResultsTitle}
      >
        {tx.copyResults}
      </AdminButton>
      <AdminButton
        variant="ghost"
        size="sm"
        onClick={onPrint}
        className="print:hidden"
        title={tx.printTitle}
      >
        PDF
      </AdminButton>
    </div>
  );
}
