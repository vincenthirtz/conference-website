// pages/admin/demandes/index.tsx
//
// Liste staff des demandes (« Le Ruban », lot 7A). La page garde le chargement
// SSR (le chargement vit dans features/admin/demandes/listLoader.ts), l'état
// (sélection, modales) et tous les appels ; l'affichage vit dans
// features/admin/demandes/ui/DemandesList*.tsx, les types et règles pures dans
// features/admin/demandes/listModel.ts.

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  demandesClient,
  demandesPaths,
} from '@/features/admin/demandes/client';
import { useInvalidateDemandes } from '@/features/admin/demandes/hooks/useDemandesQueries';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import {
  isBattleTagFlagged,
  resolveDemandeBattleTag,
  type Demande,
} from '@/features/admin/demandes/listModel';
import {
  DEMANDES_PAGE_SIZE,
  type DemandesListProps,
  loadDemandesList,
} from '@/features/admin/demandes/listLoader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import DemandesListStats from '@/features/admin/demandes/ui/DemandesListStats';
import DemandesListFilters from '@/features/admin/demandes/ui/DemandesListFilters';
import DemandesListTable from '@/features/admin/demandes/ui/DemandesListTable';
import {
  DemandesListBulkBar,
  DemandesListErrorBanner,
  DemandesListPagination,
} from '@/features/admin/demandes/ui/DemandesListBars';
import {
  DemandesListInfoModal,
  DemandesListTagModal,
} from '@/features/admin/demandes/ui/DemandesListModals';

type Props = DemandesListProps & {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
};

const D_FILTER_KEYS = [
  'type',
  'status',
  'tournamentId',
  'search',
  'from',
  'to',
  'offset',
  'orderBy',
  'orderDir',
  'assigned',
] as const;
type FilterKey = (typeof D_FILTER_KEYS)[number];
const LIMIT = DEMANDES_PAGE_SIZE;

export const getServerSideProps = withStaffPage(
  { permission: 'manage_teams' },
  (ctx, staffCtx) =>
    loadDemandesList(ctx.query, {
      tenantId: staffCtx.tenantId,
      staffId: staffCtx.staff.id,
      db: supabaseAdmin,
    })
);

function AdminDemandesPage({
  initialDemandes,
  initialTotal,
  tournaments,
  statusCounts,
  initialError,
  assignmentAvailable,
}: Props) {
  const t = useAdminT(nsAdminDemandesList);
  const { addToast } = useToast();
  const { adminFetch } = useAdminFetch();
  const invalidateDemandes = useInvalidateDemandes();
  const router = useRouter();
  const { filters } = useUrlFilters(D_FILTER_KEYS);

  const typeFilter = filters.type ?? '';
  const statusFilter = filters.status ?? 'pending';
  const tournamentFilter = filters.tournamentId ?? '';
  const search = filters.search ?? '';
  const dateFrom = filters.from ?? '';
  const dateTo = filters.to ?? '';
  const offset = Math.max(0, Number(filters.offset) || 0);
  const orderBy =
    filters.orderBy === 'processed_at' ? 'processed_at' : 'created_at';
  const orderDir = filters.orderDir === 'asc' ? 'asc' : 'desc';
  const assignedFilter = filters.assigned ?? '';
  const limit = LIMIT;

  const demandes = initialDemandes;
  const total = initialTotal;
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [searchInput, setSearchInput] = useState(search);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [singleProcessing, setSingleProcessing] = useState<string | null>(null);

  // Approval confirm modal for flagged (invalid/missing BattleTag) demandes:
  // staff can fix the tag inline before the membership is created.
  const [tagModal, setTagModal] = useState<{
    demande: Demande;
    value: string;
  } | null>(null);

  // "Demander plus d'infos" modal.
  const [infoModal, setInfoModal] = useState<{
    demande: Demande;
    note: string;
  } | null>(null);
  const [infoProcessing, setInfoProcessing] = useState(false);

  const hasActiveFilters =
    !!typeFilter ||
    !!tournamentFilter ||
    !!search ||
    !!dateFrom ||
    !!dateTo ||
    !!assignedFilter ||
    statusFilter !== 'pending' ||
    orderBy !== 'created_at' ||
    orderDir !== 'desc';

  // Apply filters with full SSR refresh (useUrlFilters does shallow routing,
  // which would leave the SSR-loaded list stale).
  function applyFilters(updates: Partial<Record<FilterKey, string | null>>) {
    const query: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(router.query)) {
      if (v !== undefined) query[k] = v;
    }
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === undefined || v === '') {
        delete query[k];
      } else {
        query[k] = v as string;
      }
    }
    router.push({ pathname: router.pathname, query }, undefined, {
      scroll: false,
    });
  }

  function applyFilter(key: FilterKey, value: string | null) {
    applyFilters({ [key]: value } as Partial<Record<FilterKey, string | null>>);
  }

  async function refresh() {
    // Les vues joueuse / capitaine et les fiches en cache se relisent aussi.
    void invalidateDemandes();
    await router.replace(router.asPath, undefined, { scroll: false });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === demandes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(demandes.map((d) => d.id)));
    }
  }

  async function postUpdateStatus(
    ids: string[],
    newStatus: 'approved' | 'rejected',
    battleTagOverrides?: Record<string, string>
  ) {
    return demandesClient.updateStatus({
      ids,
      newStatus,
      battleTagOverrides,
    });
  }

  async function handleBatchAction(newStatus: 'approved' | 'rejected') {
    if (selected.size === 0) return;
    setBatchProcessing(true);
    setErrorMsg(null);
    try {
      const json = await postUpdateStatus(Array.from(selected), newStatus);
      addToast(
        format(
          newStatus === 'approved'
            ? t.toastBatchApproved
            : t.toastBatchRejected,
          { count: json.updatedCount }
        ),
        'success'
      );
      setSelected(new Set());
      refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.error);
    } finally {
      setBatchProcessing(false);
    }
  }

  /**
   * Relance les capitaines d'une demande de scrim sur Discord.
   *
   * Réservé au type `scrim` : c'est le seul qui déclenche des DM. Le résultat
   * n'est pas connu ici — l'envoi passe par l'outbox du bot — d'où un message
   * qui renvoie au salon d'actions plutôt qu'un « envoyé ✓ » qu'on ne peut pas
   * garantir.
   */
  // « Je prends » / « Libérer » (409 : déjà pris par quelqu'un d'autre).
  async function handleAssign(id: string, action: 'claim' | 'release') {
    setSingleProcessing(id);
    try {
      await demandesClient.assign(id, action);
      addToast(
        action === 'claim' ? t.toastClaimed : t.toastReleased,
        'success'
      );
      refresh();
    } catch (err) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setSingleProcessing(null);
    }
  }

  async function handleNotifyCaptains(id: string) {
    setSingleProcessing(id);
    setErrorMsg(null);
    try {
      const json = await demandesClient.notifyCaptains(id);
      addToast(json?.message || t.notifyCaptainsDone, 'success');
    } catch (err) {
      const msg = (err as Error)?.message || t.notifyCaptainsFailed;
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setSingleProcessing(null);
    }
  }

  async function handleSingleAction(
    id: string,
    newStatus: 'approved' | 'rejected'
  ) {
    // Intercept approval of a flagged (invalid/missing BattleTag) demande:
    // open the confirm modal so staff can fix the tag inline first.
    if (newStatus === 'approved') {
      const d = demandes.find((x) => x.id === id);
      if (d && isBattleTagFlagged(d)) {
        setTagModal({
          demande: d,
          value: (resolveDemandeBattleTag(d) ?? '').trim(),
        });
        return;
      }
    }

    setSingleProcessing(id);
    setErrorMsg(null);
    try {
      await postUpdateStatus([id], newStatus);
      addToast(
        newStatus === 'approved' ? t.toastApproved : t.toastRejected,
        'success'
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setSingleProcessing(null);
    }
  }

  // Confirm approval from the BattleTag modal. The corrected tag (if any) is
  // sent as a per-demande override. We DON'T hard-block on an invalid tag —
  // staff can approve anyway (a warning toast surfaces the issue).
  async function confirmTagApproval() {
    if (!tagModal) return;
    const { demande, value } = tagModal;
    const trimmed = value.trim();
    const stillInvalid = !trimmed || !BATTLE_TAG_REGEX.test(trimmed);

    setSingleProcessing(demande.id);
    setErrorMsg(null);
    try {
      await postUpdateStatus(
        [demande.id],
        'approved',
        trimmed ? { [demande.id]: trimmed } : undefined
      );
      addToast(
        stillInvalid ? t.toastApprovedInvalidTag : t.toastApproved,
        stillInvalid ? 'error' : 'success'
      );
      setTagModal(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(demande.id);
        return next;
      });
      refresh();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setSingleProcessing(null);
    }
  }

  async function submitRequestMoreInfo() {
    if (!infoModal) return;
    const note = infoModal.note.trim();
    if (!note) {
      addToast(t.errorNoteRequired, 'error');
      return;
    }
    setInfoProcessing(true);
    try {
      await demandesClient.requestMoreInfo(infoModal.demande.id, note);
      addToast(t.toastNoteSaved, 'success');
      setInfoModal(null);
      refresh();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setInfoProcessing(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters({ search: searchInput.trim() || null, offset: null });
  }

  function handleResetFilters() {
    setSearchInput('');
    setSelected(new Set());
    router.push({ pathname: router.pathname }, undefined, { scroll: false });
  }

  async function handleExportCsv() {
    const params = new URLSearchParams();
    params.set('limit', '10000');
    params.set('offset', '0');
    params.set('export', 'csv');
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (tournamentFilter) params.set('tournamentId', tournamentFilter);
    if (search.trim()) params.set('search', search.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const url = demandesPaths.csv(params);
    try {
      const res = await adminFetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'demandes.csv';
      a.click();
    } catch (e) {
      logger.error('CSV export error', e);
      window.location.href = url;
    }
  }

  const REFRESH_ICON =
    'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
  const EXPORT_ICON =
    'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminButton
          variant="ghost"
          size="xs"
          className="mb-4"
          onClick={() => router.push('/admin')}
        >
          <span aria-hidden>‹</span>
          {t.backToDashboard}
        </AdminButton>

        <AdminPageHeader
          title={t.heading}
          subtitle={
            total !== null
              ? format(
                  total > 1 ? t.countForFilter_other : t.countForFilter_one,
                  { count: total }
                )
              : t.loading
          }
          actions={
            <>
              <AdminButton variant="ghost" onClick={refresh} title={t.refresh}>
                <svg
                  aria-hidden
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={REFRESH_ICON}
                  />
                </svg>
                {t.refresh}
              </AdminButton>
              <AdminButton variant="ghost" onClick={handleExportCsv}>
                <svg
                  aria-hidden
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={EXPORT_ICON}
                  />
                </svg>
                {t.exportCsv}
              </AdminButton>
            </>
          }
        />

        <DemandesListStats
          counts={statusCounts}
          statusFilter={statusFilter}
          onSelect={(status) => applyFilters({ status, offset: null })}
        />

        {errorMsg && (
          <DemandesListErrorBanner
            message={errorMsg}
            onRetry={() => refresh()}
          />
        )}

        <DemandesListFilters
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          tournamentFilter={tournamentFilter}
          tournaments={tournaments}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          dateFrom={dateFrom}
          dateTo={dateTo}
          assignedFilter={assignmentAvailable ? assignedFilter : null}
          sortValue={`${orderBy}:${orderDir}`}
          hasActiveFilters={hasActiveFilters}
          onFilterChange={(key, value) =>
            applyFilters({ [key]: value, offset: null } as Partial<
              Record<FilterKey, string | null>
            >)
          }
          onSortChange={(value) => {
            const [ob, od] = value.split(':');
            applyFilters({
              orderBy: ob === 'created_at' ? null : ob,
              orderDir: od === 'desc' ? null : od,
              offset: null,
            });
          }}
          onSubmit={handleFilterSubmit}
          onReset={handleResetFilters}
        />

        {selected.size > 0 && (
          <DemandesListBulkBar
            count={selected.size}
            processing={batchProcessing}
            onApprove={() => handleBatchAction('approved')}
            onReject={() => handleBatchAction('rejected')}
            onClear={() => setSelected(new Set())}
          />
        )}

        <DemandesListTable
          demandes={demandes}
          selected={selected}
          processingId={singleProcessing}
          batchProcessing={batchProcessing}
          hasActiveFilters={hasActiveFilters}
          onToggleSelectAll={toggleSelectAll}
          onResetFilters={handleResetFilters}
          actions={{
            onToggle: toggleSelect,
            onRequestInfo: (d) => setInfoModal({ demande: d, note: '' }),
            onNotifyCaptains: handleNotifyCaptains,
            onApprove: (id) => handleSingleAction(id, 'approved'),
            onReject: (id) => handleSingleAction(id, 'rejected'),
            onAssign: assignmentAvailable ? handleAssign : undefined,
          }}
        />

        <DemandesListPagination
          offset={offset}
          shown={demandes.length}
          total={total}
          nextDisabled={total !== null && offset + limit >= total}
          onPrev={() =>
            applyFilter('offset', String(Math.max(0, offset - limit)) || null)
          }
          onNext={() => applyFilter('offset', String(offset + limit))}
        />
      </div>

      {/* BattleTag fix / approve-confirm modal */}
      <DemandesListTagModal
        open={Boolean(tagModal)}
        value={tagModal ? tagModal.value : null}
        processing={singleProcessing === tagModal?.demande.id}
        onChange={(value) => setTagModal((m) => (m ? { ...m, value } : m))}
        onClose={() => setTagModal(null)}
        onConfirm={confirmTagApproval}
      />

      {/* "Demander plus d'infos" modal */}
      <DemandesListInfoModal
        open={Boolean(infoModal)}
        note={infoModal ? infoModal.note : null}
        processing={infoProcessing}
        onChange={(note) => setInfoModal((m) => (m ? { ...m, note } : m))}
        onClose={() => setInfoModal(null)}
        onSubmit={submitRequestMoreInfo}
      />
    </>
  );
}

export default withAdminQuery(AdminDemandesPage);
