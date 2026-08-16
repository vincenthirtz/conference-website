// components/admin/dashboard/ConfirmAdvanceModal.tsx
// Modale de confirmation pour avancer auto les équipes d'une phase.
// Appelle POST /api/admin/stages/[stageId]/advance avec { auto: true }.

import { useEffect, useState } from 'react';
import {
  useIdempotentMutation,
  BgSyncQueuedError,
} from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDashboardConfirmAdvanceModal from '@/lib/i18n/locales/admin-fr/adminDashboardConfirmAdvanceModal';

type Props = {
  open: boolean;
  stageId: string;
  stageName: string;
  onClose: () => void;
  onSuccess?: (advancedCount: number) => void;
};

export default function ConfirmAdvanceModal({
  open,
  stageId,
  stageName,
  onClose,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateJson } = useIdempotentMutation();
  const t = useAdminT(nsAdminDashboardConfirmAdvanceModal);

  // La modale n'est pas remontée entre deux ouvertures (pas de key côté
  // appelant) : réarmer les états transitoires à chaque ouverture ou
  // changement de cible, sinon l'erreur d'une phase A s'affiche en ouvrant
  // la phase B.
  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
    }
  }, [open, stageId]);

  if (!open) return null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // mutateJson injecte l'Idempotency-Key : un retry réseau ne re-déclenche
      // pas un second avancement (l'endpoint rejoue la 1ère réponse une fois
      // qu'il honore le header).
      const json = await mutateJson<{ advanced?: unknown }>(
        `/api/admin/stages/${stageId}/advance`,
        {
          method: 'POST',
          body: JSON.stringify({ auto: true }),
        }
      );
      const count = Array.isArray(json.advanced) ? json.advanced.length : 0;
      onSuccess?.(count);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof BgSyncQueuedError
          ? t.offline
          : ((e as Error)?.message ?? t.unexpectedError);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">{t.title}</h3>
        <p className="mt-2 text-sm text-neutral-300">
          {t.bodyBefore}
          <span className="font-semibold text-white">{stageName}</span>
          {t.bodyAfter}
          <code className="rounded bg-neutral-800 px-1 text-xs">
            advancement_rules
          </code>
          {t.bodyClose}
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          {t.warningBefore}
          <strong>{t.warningStrong}</strong>
          {t.warningAfter}
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            disabled={submitting}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {t.advanceNow}
          </button>
        </div>
      </div>
    </div>
  );
}
