// features/admin/simulator/ui/SimulatorCreateFeedback.tsx — retour de la
// création d'un vrai tournoi depuis la simulation : succès (lien vers le hub
// du tournoi) ou erreur, chacun refermable. Présentationnel.

import { format } from '@/lib/i18n/useAdminT';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import type { SimulatorDict } from '../hooks/simulatorHookTypes';

export default function SimulatorCreateFeedback({
  tx,
  result,
  error,
  onCloseResult,
  onCloseError,
}: {
  tx: SimulatorDict;
  result: { id: string; name: string } | null;
  error: string | null;
  onCloseResult: () => void;
  onCloseError: () => void;
}) {
  return (
    <>
      {result && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-card,14px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] p-4"
        >
          <div>
            <p className="text-sm font-semibold text-[var(--lf-200,#b3e7a3)]">
              {format(tx.createdSuccess, { name: result.name })}
            </p>
            <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
              {tx.createdDraftNote}
            </p>
          </div>
          <div className="flex gap-2">
            <AdminButtonLink
              href={`/admin/tournament/${result.id}/dashboard`}
              variant="primary"
              size="sm"
            >
              {tx.viewTournament}
            </AdminButtonLink>
            <AdminButton variant="ghost" size="sm" onClick={onCloseResult}>
              {tx.close}
            </AdminButton>
          </div>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] p-4"
        >
          <p className="text-sm text-[var(--err,#ff6b6b)]">{error}</p>
          <AdminButton variant="ghost" size="sm" onClick={onCloseError}>
            {tx.close}
          </AdminButton>
        </div>
      )}
    </>
  );
}
