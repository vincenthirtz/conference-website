// components/admin/tenants/tenantTableColumns.tsx
//
// Colonnes des deux tables de la fiche tenant (serveurs Discord, staff),
// extraites de `pages/admin/tenants/[id].tsx` — lot A7 : tout lot qui touche un
// god-component en sort un morceau. La migration vers le kit de listes (A5) y
// ajoutait deux définitions de colonnes ; les laisser dans la page l'aurait
// fait grossir, et le garde-fou de taille l'a refusé.
//
// Des FABRIQUES et non des constantes : les colonnes se referment sur le
// dictionnaire, l'id du tenant et le geste de retrait, qui vivent dans la page.

import type { DataTableColumn } from '@/components/admin/DataTable';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

export type GuildRow = {
  guild_id: string;
  guild_name: string | null;
  joined_at: string | null;
};

export type StaffRow = {
  staff_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  added_at: string | null;
};

/** Libellés dont dépendent les deux tables. */
export type TenantTableLabels = {
  colGuildId: string;
  colGuildName: string;
  colJoinedAt: string;
  colActions: string;
  configure: string;
  colStaffName: string;
  colStaffEmail: string;
  colStaffRole: string;
  colAddedAt: string;
  removeStaff: string;
};

export function buildGuildColumns(opts: {
  t: TenantTableLabels;
  tenantId: string;
  formatDate: (value: string | null) => string;
}): DataTableColumn<GuildRow>[] {
  const { t, tenantId, formatDate } = opts;
  return GUILD_COLUMNS(t, tenantId, formatDate);
}

export function buildStaffColumns(opts: {
  t: TenantTableLabels;
  formatDate: (value: string | null) => string;
  onRemove: (row: StaffRow) => void;
}): DataTableColumn<StaffRow>[] {
  const { t, formatDate, onRemove } = opts;
  return STAFF_COLUMNS(t, formatDate, onRemove);
}

const GUILD_COLUMNS = (
  t: TenantTableLabels,
  tenantId: string,
  formatDate: (value: string | null) => string
): DataTableColumn<GuildRow>[] => [
  {
    key: 'guild_id',
    header: t.colGuildId,
    value: (g) => g.guild_id,
    className: 'font-mono text-xs text-purple-300',
  },
  {
    key: 'guild_name',
    header: t.colGuildName,
    value: (g) => g.guild_name ?? '',
    className: 'text-white',
    render: (g) => <>{g.guild_name ?? '—'}</>,
  },
  {
    key: 'joined_at',
    header: t.colJoinedAt,
    value: (g) => g.joined_at ?? '',
    className: 'text-xs text-neutral-400',
    render: (g) => <>{formatDate(g.joined_at)}</>,
  },
  {
    key: 'actions',
    header: t.colActions,
    sortable: false,
    headerClassName: 'text-right',
    className: 'text-right',
    render: (g) => (
      <AdminButtonLink
        variant="ghost"
        size="xs"
        href={`/admin/tenants/${tenantId}/discord-config/${g.guild_id}`}
      >
        {t.configure}
      </AdminButtonLink>
    ),
  },
];

const STAFF_COLUMNS = (
  t: TenantTableLabels,
  formatDate: (value: string | null) => string,
  onRemove: (row: StaffRow) => void
): DataTableColumn<StaffRow>[] => [
  {
    key: 'name',
    header: t.colStaffName,
    value: (row) => row.display_name ?? '',
    className: 'text-white',
    render: (row) => <>{row.display_name ?? '—'}</>,
  },
  {
    key: 'email',
    header: t.colStaffEmail,
    value: (row) => row.email ?? '',
    className: 'text-neutral-300',
    render: (row) => <>{row.email ?? '—'}</>,
  },
  {
    key: 'role',
    header: t.colStaffRole,
    value: (row) => row.role,
    render: (row) => <Chip>{row.role}</Chip>,
  },
  {
    key: 'added_at',
    header: t.colAddedAt,
    value: (row) => row.added_at ?? '',
    className: 'text-xs text-neutral-400',
    render: (row) => <>{formatDate(row.added_at)}</>,
  },
  {
    key: 'actions',
    header: t.colActions,
    sortable: false,
    headerClassName: 'text-right',
    className: 'text-right',
    render: (row) => (
      <AdminButton
        variant="danger"
        size="xs"
        type="button"
        onClick={() => onRemove(row)}
      >
        {t.removeStaff}
      </AdminButton>
    ),
  },
];
