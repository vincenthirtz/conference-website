// features/admin/free-players/ui/FreePlayersTable.tsx — la liste staff des
// joueuses libres, présentationnelle : elle reçoit les lignes et le geste de
// retrait, elle ne charge rien.

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminFreePlayers from '@/lib/i18n/locales/admin-fr/adminFreePlayers';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import type { FreePlayerAdminItem } from '../schemas';

type Props = {
  items: FreePlayerAdminItem[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onRemove: (item: FreePlayerAdminItem) => void;
  /** Id de la fiche en cours de retrait (bouton désactivé). */
  removingId: string | null;
};

export default function FreePlayersTable({
  items,
  loading,
  error,
  onRetry,
  onRemove,
  removingId,
}: Props) {
  const t = useAdminT(nsAdminFreePlayers);

  // Lot A5 : colonnes DÉCLARATIVES. `value` sert à la fois au tri, à la
  // recherche et à l'export CSV — l'export cesse d'être une seconde
  // description des mêmes données, qui dérive de la première.
  const columns: DataTableColumn<FreePlayerAdminItem>[] = [
    {
      key: 'name',
      header: t.colName,
      value: (i) => i.name || t.noName,
      className: 'font-medium text-white',
    },
    {
      key: 'roles',
      header: t.colRoles,
      value: (i) => (i.roles.length > 0 ? i.roles.join(', ') : ''),
    },
    { key: 'level', header: t.colLevel, value: (i) => i.level ?? '' },
    {
      key: 'availability',
      header: t.colAvailability,
      value: (i) => i.availability ?? '',
      className: 'max-w-xs',
    },
    {
      key: 'contact',
      header: t.colContact,
      value: (i) =>
        i.contactEmail ?? (i.discordUsername ? `@${i.discordUsername}` : ''),
      render: (i) =>
        i.contactEmail ? (
          <a
            href={`mailto:${i.contactEmail}`}
            className="text-purple-300 underline underline-offset-2"
          >
            {i.contactEmail}
          </a>
        ) : i.discordUsername ? (
          <span className="font-mono text-xs">@{i.discordUsername}</span>
        ) : (
          <>{t.noContact}</>
        ),
    },
    {
      key: 'source',
      header: t.colSource,
      value: (i) => (i.source === 'web' ? t.sourceWeb : t.sourceDiscord),
    },
    {
      key: 'since',
      header: t.colSince,
      // Trié sur l'ISO, affiché en date locale : trier une date affichée
      // « 03/09 » la classerait alphabétiquement.
      value: (i) => i.markedAt ?? '',
      render: (i) => (
        <>
          {i.markedAt ? new Date(i.markedAt).toLocaleDateString('fr-FR') : '—'}
        </>
      ),
    },
    {
      key: 'actions',
      header: t.colActions,
      sortable: false,
      render: (i) => (
        <button
          type="button"
          onClick={() => onRemove(i)}
          disabled={removingId === i.id}
          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          {removingId === i.id ? t.removing : t.remove}
        </button>
      ),
    },
  ];

  return (
    <DataTable<FreePlayerAdminItem>
      rows={items}
      columns={columns}
      rowKey={(i) => i.id}
      loading={loading}
      error={error ? t.loadError : null}
      onRetry={onRetry}
      emptyTitle={t.empty}
      searchPlaceholder={t.searchPlaceholder}
      exportFilename="joueuses-libres"
    />
  );
}
