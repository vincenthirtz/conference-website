// features/admin/demandes/ui/DemandesListBars.tsx — les bandeaux de la liste
// des demandes : erreur (avec « Réessayer »), actions en lot, pagination.
// Présentationnels : les appels, la sélection et la navigation restent dans
// la page, qui passe l'état et les gestes.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

export function DemandesListErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useAdminT(nsAdminDemandesList);
  return (
    <div
      role="alert"
      className="mb-6 flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
    >
      <span className="flex-1">{message}</span>
      <AdminButton variant="danger" size="xs" onClick={onRetry}>
        {t.retry}
      </AdminButton>
    </div>
  );
}

export function DemandesListBulkBar({
  count,
  processing,
  onApprove,
  onReject,
  onClear,
}: {
  count: number;
  processing: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}) {
  const t = useAdminT(nsAdminDemandesList);
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-3 rounded-[var(--r-ctrl,4px)] border-b border-[var(--line,rgba(194,196,201,.12))] bg-[rgba(180,103,209,.10)] px-4 py-2.5"
      role="status"
    >
      <span className="text-[13px] text-[var(--or-200,#eec4ff)]" data-numeric>
        {format(count > 1 ? t.selectedCount_other : t.selectedCount_one, {
          count,
        })}
      </span>
      <div className="flex-1" />
      <AdminButton
        variant="secondary"
        size="xs"
        onClick={onApprove}
        disabled={processing}
      >
        {t.approve}
      </AdminButton>
      <AdminButton
        variant="danger"
        size="xs"
        onClick={onReject}
        disabled={processing}
      >
        {t.reject}
      </AdminButton>
      <AdminButton variant="ghost" size="xs" onClick={onClear}>
        {t.deselect}
      </AdminButton>
    </div>
  );
}

export function DemandesListPagination({
  offset,
  shown,
  total,
  nextDisabled,
  onPrev,
  onNext,
}: {
  offset: number;
  /** Nombre de lignes de la page courante. */
  shown: number;
  total: number | null;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useAdminT(nsAdminDemandesList);
  return (
    <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3">
      <AdminButton
        variant="ghost"
        size="sm"
        disabled={offset === 0}
        onClick={onPrev}
      >
        <span aria-hidden>‹</span>
        {t.previous}
      </AdminButton>

      <span className="text-xs text-[var(--t4,#807984)]" data-numeric>
        {shown === 0 ? 0 : offset + 1} – {offset + shown}
        {total ? format(t.paginationTotal, { total }) : ''}
      </span>

      <AdminButton
        variant="ghost"
        size="sm"
        disabled={nextDisabled}
        onClick={onNext}
      >
        {t.next}
        <span aria-hidden>›</span>
      </AdminButton>
    </div>
  );
}
