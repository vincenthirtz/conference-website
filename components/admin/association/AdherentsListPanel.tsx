// components/admin/association/AdherentsListPanel.tsx
// Admin: liste des adhérents de l'association (cotisations, rôles, sync
// HelloAsso). Rendered as the "Adhérents" tab of the /admin/association hub.
//
// Endpoints:
//   GET    /api/admin/adherents?q=&sort=&dir=&page=&pageSize=&paymentStatus=&year=&role=&active=
//          → { items, total, stats }   (contrat de liste admin, lot L13)
//   PATCH  /api/admin/adherents/[id]     → { paymentStatus, paymentAmount, paymentDate }
//   DELETE /api/admin/adherents/[id]
//   POST   /api/admin/helloasso/sync?formSlug=…
//   GET    /api/admin/site-settings      (montant cotisation)
//
// L'éditeur (adherents/new, adherents/[id]) reste une route à part.
// minRole 'admin' (miroir des routes API + host).

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { serverErrorText } from '@/features/admin/_shared/serverErrorText';
import {
  adherentsClient,
  adherentsPaths,
} from '@/features/admin/adherents/client';
import { useCotisationAmount } from '@/features/admin/adherents/hooks/useAdherents';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import nsAdminAdherentsList from '@/lib/i18n/locales/admin-fr/adminAdherentsList';
import { useQueryClient } from '@tanstack/react-query';
import { adminKey, withAdminQuery } from '@/features/admin/_shared/query';
import { useAdminList } from '@/features/admin/_shared/list';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import ListToolbar, {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';

type Dict = typeof nsAdminAdherentsList.fr;
type AdherentRow = {
  id: string;
  member_number: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  join_date: string;
  current_year: number;
  payment_status: 'pending' | 'partial' | 'paid' | 'exempt' | 'overdue';
  payment_amount: number;
  payment_date: string | null;
  payment_method: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
};

type Stats = {
  total: number;
  currentYear: number;
  paid: number;
  pending: number;
  overdue: number;
};

function getPaymentStatusLabels(t: Dict): Record<string, string> {
  return {
    pending: t.statusPending,
    partial: t.statusPartial,
    paid: t.statusPaid,
    exempt: t.statusExempt,
    overdue: t.statusOverdue,
  };
}

const paymentStatusTones: Record<string, ChipTone> = {
  pending: 'warn',
  partial: 'brand',
  paid: 'ok',
  exempt: 'neutral',
  overdue: 'err',
};

function getRoleLabels(t: Dict): Record<string, string> {
  return {
    member: t.roleMember,
    volunteer: t.roleVolunteer,
    board: t.roleBoard,
    president: t.rolePresident,
    treasurer: t.roleTreasurer,
    secretary: t.roleSecretary,
  };
}

function AdherentsListPanel() {
  const t = useAdminT(nsAdminAdherentsList);
  const paymentStatusLabels = getPaymentStatusLabels(t);
  const roleLabels = getRoleLabels(t);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  // Liste paginée, filtrée ET triée côté serveur (lot L13) : recherche, tri,
  // page et filtres vivent dans l'URL — une vue filtrée se partage par lien.
  const list = useAdminList<
    { items: AdherentRow[]; total: number; stats: Stats },
    'paymentStatus' | 'year' | 'role' | 'active'
  >({
    key: 'adherents',
    url: adherentsPaths.list,
    filterKeys: ['paymentStatus', 'year', 'role', 'active'],
    pageSize: 50,
  });
  const adherents = list.items;
  const stats = list.data?.stats ?? null;
  const total = list.total;
  const queryClient = useQueryClient();
  // Après un geste (retrait, paiement, synchro) : toutes les pages et tous
  // les filtres de la liste sont périmés, pas seulement la page affichée.
  const fetchData = () =>
    void queryClient.invalidateQueries({ queryKey: adminKey('adherents') });

  // Montant de cotisation : réglage distinct (site-settings), lu une fois ;
  // indisponible → 0, comme avant.
  const { data: cotisationAmount = 0 } = useCotisationAmount();

  const onDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: format(t.confirmDeleteTitle, { name }),
      variant: 'danger',
      confirmLabel: t.delete,
    });
    if (!ok) return;
    try {
      await adherentsClient.remove(id).catch((err: unknown) => {
        throw new Error(serverErrorText(err) || t.errorDeleteFailed);
      });
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorDelete, 'error');
    }
  };

  const updatePaymentStatus = async (
    id: string,
    newStatus: string,
    isPaid: boolean
  ) => {
    try {
      const payload: Record<string, unknown> = {
        paymentStatus: newStatus,
      };

      if (isPaid) {
        payload.paymentAmount = cotisationAmount;
        payload.paymentDate = new Date().toISOString().split('T')[0];
      }

      await adherentsClient.update(id, payload).catch((err: unknown) => {
        throw new Error(serverErrorText(err) || t.errorUpdateFailed);
      });
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorUpdate, 'error');
    }
  };

  const syncHelloAsso = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const json = await adherentsClient.syncHelloAsso(
        'adhesion-2026-2027-women-s-cup'
      );

      setSyncResult(
        format(t.syncOk, {
          created: json.created,
          updated: json.updated,
          skipped: json.skipped,
        })
      );
      fetchData();
    } catch (err: unknown) {
      setSyncResult(
        format(t.syncError, { message: (err as Error)?.message ?? '' })
      );
    } finally {
      setSyncing(false);
    }
  };

  // Colonnes DÉCLARATIVES (lot A5) : `value` sert au tri, à la recherche et à
  // l'export ; `render` ne s'occupe que de l'apparence. L'export CSV cesse
  // d'être une seconde description des mêmes données.
  const columns: DataTableColumn<AdherentRow>[] = [
    {
      key: 'member_number',
      sortable: true,
      header: t.colMemberNumber,
      value: (a) => a.member_number ?? '',
      className: 'font-mono text-neutral-300',
    },
    {
      key: 'last_name',
      sortable: true,
      header: t.colName,
      value: (a) => `${a.last_name} ${a.first_name}`,
      render: (a) => (
        <span>
          <span className="font-medium text-white">
            {a.last_name} {a.first_name}
          </span>
          {!a.is_active && (
            <span className="ml-2 text-xs text-neutral-500">
              {t.inactiveTag}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'email',
      header: t.colEmail,
      value: (a) => a.email ?? '',
      className: 'text-neutral-400',
    },
    {
      key: 'role',
      sortable: true,
      header: t.colRole,
      value: (a) => roleLabels[a.role] || a.role,
      className: 'text-neutral-300',
    },
    {
      key: 'current_year',
      sortable: true,
      header: t.colYear,
      value: (a) => a.current_year ?? '',
      className: 'text-neutral-300',
    },
    {
      key: 'payment_status',
      sortable: true,
      header: t.colPayment,
      value: (a) => paymentStatusLabels[a.payment_status],
      render: (a) => (
        <Chip tone={paymentStatusTones[a.payment_status]}>
          {paymentStatusLabels[a.payment_status]}
        </Chip>
      ),
    },
    {
      key: 'payment_amount',
      sortable: true,
      header: t.colAmount,
      value: (a) => a.payment_amount,
      render: (a) => (
        <span className="text-neutral-300">
          {a.payment_amount.toFixed(2)} €
          {cotisationAmount > 0 && a.payment_status !== 'paid' && (
            <span className="ml-1 text-xs text-neutral-500">
              / {cotisationAmount.toFixed(2)} €
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.colActions,
      sortable: false,
      headerClassName: 'text-right',
      className: 'text-right',
      render: (a) => (
        <span className="flex items-center justify-end gap-2">
          {a.payment_status !== 'paid' && a.payment_status !== 'exempt' && (
            <AdminButton
              variant="ghost"
              size="xs"
              onClick={() => updatePaymentStatus(a.id, 'paid', true)}
              title={t.markPaidTitle}
            >
              {t.markPaidShort}
            </AdminButton>
          )}
          <AdminButtonLink
            variant="ghost"
            size="xs"
            href={`/admin/adherents/${a.id}`}
          >
            {t.edit}
          </AdminButtonLink>
          <AdminButton
            variant="danger"
            size="xs"
            onClick={() => onDelete(a.id, `${a.first_name} ${a.last_name}`)}
          >
            {t.deleteShort}
          </AdminButton>
        </span>
      ),
    },
  ];

  return (
    <>
      {dialog}

      <AdminPageHeader
        level={2}
        title={t.heading}
        subtitle={
          <>
            {format(
              (total !== null ? total : adherents.length) > 1
                ? t.countMembers_other
                : t.countMembers_one,
              { count: total !== null ? total : adherents.length }
            )}
            {cotisationAmount > 0 && (
              <span className="ml-2">
                ·{' '}
                {format(t.cotisationInfo, {
                  amount: cotisationAmount.toFixed(2),
                })}
              </span>
            )}
          </>
        }
        actions={
          <>
            <AdminButton
              variant="ghost"
              onClick={syncHelloAsso}
              disabled={syncing}
            >
              {syncing ? t.syncing : t.syncHelloAsso}
            </AdminButton>
            <AdminButtonLink variant="primary" href="/admin/adherents/new">
              {t.newAdherent}
            </AdminButtonLink>
          </>
        }
      />

      {/* Sync result */}
      {syncResult && (
        <div
          className={`mb-6 rounded-[var(--r-card,14px)] border p-4 text-sm ${
            syncResult.startsWith('Erreur')
              ? 'border-red-500/30 bg-red-600/10 text-red-300'
              : 'border-emerald-500/30 bg-emerald-600/10 text-emerald-300'
          }`}
        >
          {syncResult}
        </div>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatTile label={t.statTotalActive} value={stats.total} />
          <StatTile
            label={format(t.statYear, { year: currentYear })}
            value={stats.currentYear}
            tone="brand"
          />
          <StatTile label={t.statPaid} value={stats.paid} tone="ok" />
          <StatTile label={t.statPending} value={stats.pending} tone="warn" />
          <StatTile
            label={t.statOverdue}
            value={stats.overdue}
            tone={stats.overdue > 0 ? 'err' : 'neutral'}
          />
        </div>
      )}

      {/* Archétype Liste : recherche + filtres sur une ligne, jamais ailleurs. */}
      <ListToolbar
        search={
          <ListSearch
            value={list.search}
            onChange={list.setSearch}
            placeholder={t.searchPlaceholder}
            label={t.filterSearch}
          />
        }
        filters={
          <>
            <FilterSelect
              label={t.filterPaymentStatus}
              allLabel={t.paymentStatusAll}
              value={list.filters.paymentStatus}
              onChange={(v) => list.setFilter('paymentStatus', v)}
              options={[
                { value: 'pending', label: t.statusPending },
                { value: 'partial', label: t.statusPartial },
                { value: 'paid', label: t.statusPaid },
                { value: 'exempt', label: t.statusExempt },
                { value: 'overdue', label: t.statusOverdue },
              ]}
            />
            <FilterSelect
              label={t.filterYear}
              allLabel={t.yearAll}
              value={list.filters.year}
              onChange={(v) => list.setFilter('year', v)}
              options={[currentYear, currentYear - 1, currentYear - 2].map(
                (y) => ({ value: String(y), label: String(y) })
              )}
            />
            <FilterSelect
              label={t.filterRole}
              allLabel={t.roleAll}
              value={list.filters.role}
              onChange={(v) => list.setFilter('role', v)}
              options={[
                { value: 'member', label: t.roleMember },
                { value: 'volunteer', label: t.roleVolunteer },
                { value: 'board', label: t.roleBoard },
                { value: 'president', label: t.rolePresident },
                { value: 'treasurer', label: t.roleTreasurer },
                { value: 'secretary', label: t.roleSecretary },
              ]}
            />
            <FilterSelect
              label={t.filterActive}
              allLabel={t.activeAll}
              value={list.filters.active}
              onChange={(v) => list.setFilter('active', v)}
              options={[
                { value: 'true', label: t.activeYes },
                { value: 'false', label: t.activeNo },
              ]}
            />
          </>
        }
      />

      {/* Liste — kit partagé en mode SERVEUR (lot L13) : la table lit tri et
          page dans l'URL, le serveur les applique. Colonnes triables = celles
          que le serveur accepte (`sortable: true`, clé = nom de colonne). */}
      <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 backdrop-blur">
        <DataTable<AdherentRow>
          rows={adherents}
          columns={columns}
          rowKey={(a) => a.id}
          loading={list.isPending}
          error={list.isError ? t.errorLoad : null}
          onRetry={() => void list.refetch()}
          emptyTitle={t.empty}
          exportFilename="adherents"
          server={{
            total,
            pageSize: list.pageSize,
            fetching: list.isFetching && !list.isPending,
          }}
        />
      </section>
    </>
  );
}

export default withAdminQuery(AdherentsListPanel);
