// features/admin/teams/ui/TeamsListPagination.tsx — pagination serveur de la
// liste des équipes : précédent / plage affichée / suivant. Les bornes et le
// décalage sont calculés par la page (le hook useAdminResource les possède).

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamsList from '@/lib/i18n/locales/admin-fr/adminTeamsList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

export default function TeamsListPagination({
  offset,
  shown,
  total,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
}: {
  offset: number;
  /** Nombre de lignes de la page courante. */
  shown: number;
  total: number | null;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useAdminT(nsAdminTeamsList);
  return (
    <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3">
      <AdminButton
        variant="ghost"
        size="sm"
        disabled={prevDisabled}
        onClick={onPrev}
      >
        <span aria-hidden>‹</span>
        {t.previous}
      </AdminButton>

      <span className="text-xs text-[var(--t4,#807984)]" data-numeric>
        {format(t.paginationRange, { from: offset + 1, to: offset + shown })}
        {total ? format(t.paginationOf, { total }) : ''}
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
