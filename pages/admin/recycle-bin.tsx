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
    | 'announcement'
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

export const getServerSideProps = withStaffPage({ permission: 'manage_settings' });

function typeLabel(type: string, t: Dict) {
  switch (type) {
    case 'stage':
      return t.typeStage;
    case 'team':
      return t.typeTeam;
    case 'match':
      return t.typeMatch;
    case 'announcement':
      return t.typeAnnouncement;
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
    case 'announcement':
      return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30';
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

function AdminRecycleBinPage({ staff }: StaffProps) {
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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
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

            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {t.subtitle}
              {total !== null && (
                <span className="ml-1">
                  {format(total > 1 ? t.countInBin_other : t.countInBin_one, {
                    count: total,
                  })}
                </span>
              )}
            </p>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
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
          {/* Filter */}
          <div className="flex gap-3 mb-6">
            <select
              className="px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={typeFilter}
              onChange={(e) => {
                // Tout changement de filtre repart à la page 1.
                resetOffset();
                setRestoreError(null);
                setTypeFilter(e.target.value);
              }}
            >
              <option value="">{t.filterAll}</option>
              <option value="stage">{t.filterStages}</option>
              <option value="team">{t.filterTeams}</option>
              <option value="match">{t.filterMatches}</option>
              <option value="announcement">{t.filterAnnouncements}</option>
              <option value="partner">{t.filterPartners}</option>
              <option value="cast_member">{t.filterCastMembers}</option>
              <option value="adherent">{t.filterAdherents}</option>
              <option value="staff">{t.filterStaff}</option>
              <option value="scrim">{t.filterScrims}</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setRestoreError(null);
                fetchItems();
              }}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {t.refresh}
            </button>
          </div>

          {/* Items list */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
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
              <div className="divide-y divide-neutral-700/50">
                {items.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="p-4 hover:bg-neutral-700/20 transition-colors flex items-center gap-4"
                  >
                    {/* Type badge */}
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${typeColor(item.type)}`}
                    >
                      {typeLabel(item.type, t)}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-neutral-500 flex gap-3">
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
                    <button
                      type="button"
                      onClick={() => handleRestore(item)}
                      disabled={restoringId === item.id}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                    >
                      {restoringId === item.id ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t.restoring}
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-4 h-4"
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
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          {(items.length > 0 || offset > 0) && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
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
              </button>

              <span className="text-neutral-400 text-sm">
                {items.length > 0 ? offset + 1 : 0} – {offset + items.length}
                {total !== null ? format(t.paginationTotal, { total }) : ''}
              </span>

              <button
                type="button"
                disabled={
                  loading ||
                  (total !== null && offset + PAGE_SIZE >= total) ||
                  (total === null && items.length < PAGE_SIZE)
                }
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {t.next}
                <svg
                  className="w-4 h-4"
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
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminRecycleBinPage;
