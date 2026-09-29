// pages/admin/recycle-bin.tsx

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminRecycleBin from '@/lib/i18n/locales/admin-fr/adminRecycleBin';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import ListToolbar, {
  FilterSelect,
} from '@/features/admin/_shared/ui/ListToolbar';

type Dict = typeof nsAdminRecycleBin.fr;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type DeletedItem = {
  id: string;
  type:
    | 'stage'
    | 'team'
    | 'match'
    | 'partner'
    | 'cast_member'
    | 'adherent'
    | 'staff'
    | 'scrim';
  name: string;
  details: string | null;
  deleted_at: string | null;
  tournament_id: string | null;
};

type RecycleBinResponse = {
  items: DeletedItem[];
  total: number;
};

const PAGE_SIZE = 50;

export const getServerSideProps = withStaffPage({
  permission: 'manage_settings',
});

function typeLabel(type: string, t: Dict) {
  switch (type) {
    case 'stage':
      return t.typeStage;
    case 'team':
      return t.typeTeam;
    case 'match':
      return t.typeMatch;
    case 'partner':
      return t.typePartner;
    case 'cast_member':
      return t.typeCastMember;
    case 'adherent':
      return t.typeAdherent;
    case 'staff':
      return t.typeStaff;
    case 'scrim':
      return t.typeScrim;
    default:
      return type;
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'stage':
      return 'bg-purple-600/20 text-purple-300 border-purple-500/30';
    case 'team':
      return 'bg-blue-600/20 text-blue-300 border-blue-500/30';
    case 'match':
      return 'bg-amber-600/20 text-amber-300 border-amber-500/30';
    case 'partner':
      return 'bg-pink-600/20 text-pink-300 border-pink-500/30';
    case 'cast_member':
      return 'bg-cyan-600/20 text-cyan-300 border-cyan-500/30';
    case 'adherent':
      return 'bg-orange-600/20 text-orange-300 border-orange-500/30';
    case 'staff':
      return 'bg-rose-600/20 text-rose-300 border-rose-500/30';
    case 'scrim':
      return 'bg-teal-600/20 text-teal-300 border-teal-500/30';
    default:
      return 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30';
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function AdminRecycleBinPage(_props: StaffProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();
  const t = useAdminT(nsAdminRecycleBin);

  const [typeFilter, setTypeFilter] = useState<string>('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  // Erreur d'action « restaurer » — affichée dans la même bannière que les
  // erreurs de chargement (portées par le hook via `error`).
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Liste paginée + filtre serveur `type`. `limit: PAGE_SIZE` (50) réplique le
  // défaut de /api/admin/recycle-bin (parsePagination limit:50). `total` revient
  // toujours dans le payload → includeTotal:false garde la requête identique.
  const {
    data: items,
    total,
    loading,
    error: fetchError,
    offset,
    setOffset,
    resetOffset,
    refresh: fetchItems,
  } = useAdminResource<DeletedItem, RecycleBinResponse>(
    '/api/admin/recycle-bin',
    {
      limit: PAGE_SIZE,
      includeTotal: false,
      params: { type: typeFilter },
      select: (res) => res.items || [],
    }
  );

  const errorMsg = restoreError ?? fetchError;

  async function handleRestore(item: DeletedItem) {
    const ok = await confirm({
      title: format(t.confirmRestoreTitle, {
        type: typeLabel(item.type, t).toLowerCase(),
        name: item.name,
      }),
      variant: 'info',
      confirmLabel: t.confirmRestoreLabel,
    });
    if (!ok) return;

    setRestoringId(item.id);
    setRestoreError(null);

    try {
      await adminFetchJson('/api/admin/recycle-bin', {
        method: 'PATCH',
        body: JSON.stringify({ id: item.id, type: item.type }),
      });

      addToast(
        format(t.toastRestored, {
          type: typeLabel(item.type, t),
          name: item.name,
        }),
        'info'
      );
      fetchItems();
    } catch (err: unknown) {
      setRestoreError((err as Error)?.message ?? t.errorRestore);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      {dialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          {/* Retour au tableau de bord */}
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.backToDashboard}
          </button>

          <AdminPageHeader
            title={t.heading}
            subtitle={
              <>
                {t.subtitle}
                {total !== null && (
                  <span className="ml-1">
                    {format(total > 1 ? t.countInBin_other : t.countInBin_one, {
                      count: total,
                    })}
                  </span>
                )}
              </>
            }
          />

          {/* Messages */}
          {errorMsg && (
            <div
              role="alert"
              className="mb-6 flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
            >
              <svg
                aria-hidden
                className="h-5 w-5 flex-shrink-0 text-[var(--err,#ff6b6b)]"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}

          {/* Filtre */}
          <ListToolbar
            filters={
              <>
                <FilterSelect
                  label={t.filterTypeLabel}
                  allLabel={t.filterAll}
                  value={typeFilter}
                  onChange={(v) => {
                    // Tout changement de filtre repart à la page 1.
                    resetOffset();
                    setRestoreError(null);
                    setTypeFilter(v ?? '');
                  }}
                  options={[
                    { value: 'stage', label: t.filterStages },
                    { value: 'team', label: t.filterTeams },
                    { value: 'match', label: t.filterMatches },
                    { value: 'partner', label: t.filterPartners },
                    { value: 'cast_member', label: t.filterCastMembers },
                    { value: 'adherent', label: t.filterAdherents },
                    { value: 'staff', label: t.filterStaff },
                    { value: 'scrim', label: t.filterScrims },
                  ]}
                />
                <AdminButton
                  size="sm"
                  onClick={() => {
                    setRestoreError(null);
                    fetchItems();
                  }}
                  disabled={loading}
                >
                  {t.refresh}
                </AdminButton>
              </>
            }
          />

          {/* Items list */}
          <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
            {loading ? (
              <LoadingSpinner className="py-20" />
            ) : items.length === 0 ? (
              <div className="py-20 text-center text-[var(--t3,#a39ba6)]">
                <svg
                  aria-hidden
                  className="mx-auto mb-4 h-12 w-12 text-[var(--t4,#807984)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
                {t.empty}
              </div>
            ) : (
              <div className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
                {items.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--s2,#1d1520)]"
                  >
                    {/* Type badge */}
                    <span
                      className={`rounded-[3px] border px-2.5 py-1 text-xs font-medium ${typeColor(item.type)}`}
                    >
                      {typeLabel(item.type, t)}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--t1,#f4edf7)]">
                        {item.name}
                      </div>
                      <div className="flex gap-3 text-xs text-[var(--t4,#807984)]">
                        {item.details && <span>{item.details}</span>}
                        <span>
                          {format(t.deletedOn, {
                            date: formatDate(item.deleted_at),
                          })}
                        </span>
                        <span className="font-mono">
                          #{item.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>

                    {/* Restore button */}
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRestore(item)}
                      disabled={restoringId === item.id}
                    >
                      {restoringId === item.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[rgba(238,196,255,.3)] border-t-[var(--or-200,#eec4ff)]" />
                          {t.restoring}
                        </>
                      ) : (
                        <>
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
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                          {t.restore}
                        </>
                      )}
                    </AdminButton>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          {(items.length > 0 || offset > 0) && (
            <div className="mt-6 flex items-center justify-between">
              <AdminButton
                size="sm"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                {t.previous}
              </AdminButton>

              <span className="text-sm text-[var(--t3,#a39ba6)]" data-numeric>
                {items.length > 0 ? offset + 1 : 0} – {offset + items.length}
                {total !== null ? format(t.paginationTotal, { total }) : ''}
              </span>

              <AdminButton
                size="sm"
                disabled={
                  loading ||
                  (total !== null && offset + PAGE_SIZE >= total) ||
                  (total === null && items.length < PAGE_SIZE)
                }
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t.next}
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
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </AdminButton>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminRecycleBinPage;
