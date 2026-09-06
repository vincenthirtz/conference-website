// components/admin/scrims/ScrimPlanningsListPanel.tsx
// Panneau (onglet) : liste des grilles de planification de scrim
// (« When2Meet » partagé). Extrait de l'ancienne page
// /admin/scrims/plannings/index.tsx pour être hébergé comme onglet de la page
// /admin/scrims. Auto-suffisant : fetch, filtre, liste et modale de création.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useUrlFilters } from '@/utils/useUrlFilters';
import PlanningFormModal from '@/components/admin/scrims/PlanningFormModal';
import AdminListShell from '@/components/admin/AdminListShell';
import AdminPagination from '@/components/admin/AdminPagination';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { ScrimPlanning } from '@/types/admin';
import nsAdminScrimPlanningsList from '@/lib/i18n/locales/admin-fr/adminScrimPlanningsList';

type Dict = typeof nsAdminScrimPlanningsList.fr;

function statusLabel(status: string, t: Dict) {
  switch (status) {
    case 'open':
      return t.statusOpen;
    case 'validated':
      return t.statusValidated;
    case 'closed':
      return t.statusClosed;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'open':
      return 'bg-blue-600 text-white';
    case 'validated':
      return 'bg-emerald-600 text-white';
    case 'closed':
      return 'bg-neutral-600 text-neutral-100';
    case 'cancelled':
      return 'bg-red-700 text-red-100';
    default:
      return 'bg-neutral-700 text-neutral-200';
  }
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function formatHorizon(start: string, days: number) {
  try {
    const startD = new Date(`${start}T12:00:00Z`);
    const endD = new Date(startD.getTime() + (days - 1) * 86_400_000);
    const fmt = (x: Date) =>
      x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `${fmt(startD)} → ${fmt(endD)}`;
  } catch {
    return start;
  }
}

// Filtres portés par l'URL, comme sur la liste des scrims : un état de liste
// se partage et survit à un rechargement. Préfixe `p` pour ne pas entrer en
// collision avec les filtres de l'onglet scrims, qui vivent sous la même page.
const FILTER_KEYS = ['pq', 'pstatus'] as const;

export default function ScrimPlanningsListPanel() {
  const t = useAdminT(nsAdminScrimPlanningsList);
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);
  const statusFilter = filters.pstatus ?? '';
  const searchFilter = filters.pq ?? '';

  const [searchInput, setSearchInput] = useState(searchFilter);
  useEffect(() => {
    setSearchInput(searchFilter);
  }, [searchFilter]);

  const hasActiveFilters = Boolean(searchFilter || statusFilter);

  // Préremplissage « Passer en grille » depuis une négociation de scrim :
  // /admin/scrims?tab=plannings&new=1&team1=<id>&team2=<id>&fromDemande=<id>.
  const prefillTeam1 =
    typeof router.query.team1 === 'string' ? router.query.team1 : undefined;
  const prefillTeam2 =
    typeof router.query.team2 === 'string' ? router.query.team2 : undefined;
  const prefillDemande =
    typeof router.query.fromDemande === 'string'
      ? router.query.fromDemande
      : undefined;
  // Grille ouverte depuis un scrim sans date : la validation replanifiera ce
  // scrim au lieu d'en créer un second.
  const prefillScrim =
    typeof router.query.forScrim === 'string' ? router.query.forScrim : undefined;

  // Ouvre automatiquement la modale (une seule fois) quand `?new=1` est présent.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.new === '1') setModalOpen(true);
  }, [router.isReady, router.query.new]);

  function closeModal() {
    setModalOpen(false);
    // Nettoie les paramètres de préremplissage pour qu'une réouverture manuelle
    // reparte d'un formulaire vierge (et ne rouvre pas la modale au remount).
    if (
      router.query.new ||
      prefillTeam1 ||
      prefillTeam2 ||
      prefillDemande ||
      prefillScrim
    ) {
      const {
        new: _new,
        team1: _team1,
        team2: _team2,
        fromDemande: _fromDemande,
        forScrim: _forScrim,
        ...rest
      } = router.query;
      void router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true }
      );
    }
  }

  const {
    data: plannings,
    total,
    loading,
    error: errorMsg,
    refresh,
    offset,
    nextPage,
    prevPage,
    resetOffset,
    hasMore,
  } = useAdminResource<
    ScrimPlanning,
    { plannings: ScrimPlanning[]; total: number | null }
  >('/api/admin/scrim-plannings', {
    limit: 25,
    // L'API compte TOUJOURS (`count: 'exact'`) et renvoie ce total : le
    // panneau le jetait, et plafonnait à 50 grilles sans pagination.
    includeTotal: false,
    params: { search: searchFilter, status: statusFilter },
    select: (res) => res.plannings || [],
    selectTotal: (res) => res.total ?? null,
  });

  // Recherche soumise explicitement : `useUrlFilters` pousse une entrée
  // d'historique à chaque écriture (cf. ScrimsListPanel).
  const submitSearch = useCallback(() => {
    const next = searchInput.trim();
    if (next === searchFilter) return;
    setFilters({ pq: next || null });
    resetOffset();
  }, [searchInput, searchFilter, setFilters, resetOffset]);

  return (
    <>
      <PlanningFormModal
        open={modalOpen}
        onClose={closeModal}
        onCreated={refresh}
        initialTeam1Id={prefillTeam1}
        initialTeam2Id={prefillTeam2}
        sourceDemandeId={prefillDemande}
        scrimId={prefillScrim}
      />

      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors"
        >
          {t.newPlanning}
        </button>
      </div>

      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label
            className="block text-sm text-neutral-400 mb-1"
            htmlFor="plannings-search"
          >
            {t.searchLabel}
          </label>
          <input
            id="plannings-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitSearch();
              }
            }}
            onBlur={submitSearch}
            placeholder={t.searchPlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600"
          />
        </div>

        <div className="min-w-[180px]">
          <label
            className="block text-sm text-neutral-400 mb-1"
            htmlFor="plannings-status"
          >
            {t.statusFilterLabel}
          </label>
          <select
            id="plannings-status"
            value={statusFilter}
            onChange={(e) => setFilters({ pstatus: e.target.value || null })}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600"
          >
            <option value="">{t.filterAll}</option>
            <option value="open">{t.statusOpen}</option>
            <option value="validated">{t.statusValidated}</option>
            <option value="closed">{t.statusClosed}</option>
            <option value="cancelled">{t.statusCancelled}</option>
          </select>
        </div>
      </section>

      <AdminListShell
        loading={loading}
        error={errorMsg}
        isEmpty={plannings.length === 0}
        loadingLabel={t.loading}
        emptyTitle={hasActiveFilters ? t.emptyFiltered : t.empty}
      >
        <div className="grid gap-3">
          {plannings.map((p) => (
            <Link
              key={p.id}
              href={`/admin/scrims/plannings/${p.id}`}
              className="block bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 rounded-xl px-5 py-4 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold ${statusColor(
                      p.status
                    )}`}
                  >
                    {statusLabel(p.status, t)}
                  </span>
                  <span className="font-medium">{p.title || t.untitled}</span>
                  {p.game && (
                    <span className="text-xs text-neutral-500">{p.game}</span>
                  )}
                </div>
                <div className="text-xs text-neutral-400">
                  {formatHorizon(p.horizon_start, p.horizon_days)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-300">
                <span>
                  {format(t.teamsVs, {
                    team1: p.team1?.name || '—',
                    team2: p.team2?.name || '—',
                  })}
                </span>
                {p.validated_slot ? (
                  <span className="text-xs text-emerald-400">
                    {format(t.validatedSlot, {
                      when: formatDate(p.validated_slot),
                    })}
                  </span>
                ) : null}
                {p.scrim_id ? (
                  <span className="text-xs text-blue-400">{t.linkedScrim}</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
        <AdminPagination
          offset={offset}
          count={plannings.length}
          total={total}
          hasMore={hasMore}
          loading={loading}
          onPrev={prevPage}
          onNext={nextPage}
          labels={{ prev: t.pagePrev, next: t.pageNext, info: t.pageInfo }}
        />
      </AdminListShell>

      {plannings.length === 0 && hasActiveFilters && !loading && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setFilters({ pq: null, pstatus: null })}
            className="text-sm text-blue-400 hover:underline"
          >
            {t.resetFilters}
          </button>
        </div>
      )}
    </>
  );
}
