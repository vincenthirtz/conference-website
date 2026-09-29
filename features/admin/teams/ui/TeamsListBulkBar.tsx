// features/admin/teams/ui/TeamsListBulkBar.tsx — la barre d'actions en lot
// de la liste des équipes (planche « Liste » : bandeau orchidée au-dessus des
// lignes). Présentationnelle : l'action, sa confirmation et l'appel restent
// dans la page.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamsList from '@/lib/i18n/locales/admin-fr/adminTeamsList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

const SELECT =
  'h-[30px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 text-[12px] text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)]';

export default function TeamsListBulkBar({
  count,
  bulkAction,
  onBulkActionChange,
  assignTournamentId,
  onAssignTournamentChange,
  tournamentOptions,
  onTournamentFocus,
  processing,
  onApply,
  onCancel,
}: {
  count: number;
  bulkAction: string;
  onBulkActionChange: (value: string) => void;
  assignTournamentId: string;
  onAssignTournamentChange: (value: string) => void;
  tournamentOptions: { id: string; name: string }[];
  onTournamentFocus: () => void;
  processing: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const t = useAdminT(nsAdminTeamsList);
  return (
    <div
      className="mb-3 flex flex-col flex-wrap gap-3 rounded-[var(--r-ctrl,4px)] border-b border-[var(--line,rgba(194,196,201,.12))] bg-[rgba(180,103,209,.10)] px-4 py-2.5 sm:flex-row sm:items-center"
      role="status"
    >
      <span className="text-[13px] text-[var(--or-200,#eec4ff)]" data-numeric>
        {format(count > 1 ? t.selectedCount_other : t.selectedCount_one, {
          count,
        })}
      </span>
      <div className="flex-1" />
      <select
        className={SELECT}
        value={bulkAction}
        onChange={(e) => onBulkActionChange(e.target.value)}
      >
        <option value="">{t.bulkActionPlaceholder}</option>
        <option value="activate">{t.bulkActivate}</option>
        <option value="deactivate">{t.bulkDeactivate}</option>
        <option value="delete">{t.bulkDeleteSoft}</option>
        <option value="assign">{t.bulkAssign}</option>
      </select>
      {bulkAction === 'assign' && (
        <select
          className={SELECT}
          value={assignTournamentId}
          onFocus={onTournamentFocus}
          onChange={(e) => onAssignTournamentChange(e.target.value)}
        >
          <option value="">{t.chooseTournament}</option>
          {tournamentOptions.map((tour) => (
            <option key={tour.id} value={tour.id}>
              {tour.name}
            </option>
          ))}
        </select>
      )}
      <AdminButton
        variant={bulkAction === 'delete' ? 'danger' : 'secondary'}
        size="xs"
        onClick={onApply}
        disabled={
          processing ||
          !bulkAction ||
          (bulkAction === 'assign' && !assignTournamentId)
        }
      >
        {processing ? t.bulkProcessing : t.bulkApply}
      </AdminButton>
      <AdminButton variant="ghost" size="xs" onClick={onCancel}>
        {t.cancel}
      </AdminButton>
    </div>
  );
}
