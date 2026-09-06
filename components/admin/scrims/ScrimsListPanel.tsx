// components/admin/scrims/ScrimsListPanel.tsx
// Panneau (onglet) : liste des scrims (sessions de matchs amicaux).
// Extrait de l'ancienne page /admin/scrims/index.tsx pour être hébergé comme
// onglet de la page /admin/scrims. Auto-suffisant : fetch, filtre, liste et
// modale de création. Conserve le deep-link `?new=1` (ancienne route /create).

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useUrlFilters } from '@/utils/useUrlFilters';
import ScrimFormModal from '@/components/admin/scrims/ScrimFormModal';
import AdminListShell from '@/components/admin/AdminListShell';
import AdminPagination from '@/components/admin/AdminPagination';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { ScrimStatus } from '@/types/admin';
import nsAdminScrimsList from '@/lib/i18n/locales/admin-fr/adminScrimsList';

type Dict = typeof nsAdminScrimsList.fr;

type ScrimRow = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: ScrimStatus | string;
  team1_id: string | null;
  team2_id: string | null;
  scheduled_date: string | null;
  is_public: boolean;
  created_at: string;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  ranked: boolean | null;
  team1?: { id: string; name: string; logo_url: string | null } | null;
  team2?: { id: string; name: string; logo_url: string | null } | null;
};

function statusLabel(status: string, t: Dict) {
  switch (status) {
    case 'draft':
      return t.statusDraft;
    case 'scheduled':
      return t.statusScheduled;
    case 'running':
      return t.statusRunning;
    case 'completed':
      return t.statusCompleted;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'draft':
      return 'bg-neutral-600 text-neutral-100';
    case 'scheduled':
      return 'bg-blue-600 text-white';
    case 'running':
      return 'bg-emerald-600 text-white';
    case 'completed':
      return 'bg-purple-600 text-white';
    case 'cancelled':
      return 'bg-red-700 text-red-100';
    default:
      return 'bg-neutral-700 text-neutral-200';
  }
}

/** Un 0-0 est un résultat valide ; c'est l'absence des deux qui ne l'est pas. */
function hasScore(s: { team1_score: number | null; team2_score: number | null }) {
  return s.team1_score != null && s.team2_score != null;
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

// Filtres portés par l'URL : un état de liste se partage et survit à un
// rechargement, comme sur les autres panneaux admin.
const FILTER_KEYS = ['sq', 'sstatus', 'speriod', 'ssort'] as const;

export default function ScrimsListPanel() {
  const t = useAdminT(nsAdminScrimsList);
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);
  const statusFilter = filters.sstatus ?? '';
  const periodFilter = filters.speriod ?? '';
  const sortFilter = filters.ssort ?? 'created_desc';
  const searchFilter = filters.sq ?? '';

  // Champ contrôlé localement ; c'est `submitSearch` qui le porte dans l'URL,
  // donc dans la requête. Resynchronisé quand l'URL change (retour arrière,
  // réinitialisation des filtres).
  const [searchInput, setSearchInput] = useState(searchFilter);
  useEffect(() => {
    setSearchInput(searchFilter);
  }, [searchFilter]);

  // « À venir » / « Passés » se traduisent en bornes sur la date planifiée.
  // Recalculé à chaque changement de filtre seulement : une nouvelle valeur à
  // chaque rendu ferait boucler la requête.
  const periodParams = useMemo(() => {
    if (periodFilter !== 'upcoming' && periodFilter !== 'past') return {};
    const now = new Date().toISOString();
    return periodFilter === 'upcoming' ? { dateFrom: now } : { dateTo: now };
  }, [periodFilter]);

  const hasActiveFilters = Boolean(
    searchFilter || statusFilter || periodFilter
  );

  const [orderBy, orderDir] =
    sortFilter === 'scheduled_asc'
      ? ['scheduled_date', 'asc']
      : sortFilter === 'scheduled_desc'
        ? ['scheduled_date', 'desc']
        : ['created_at', 'desc'];

  const {
    data: scrims,
    total,
    loading,
    error: errorMsg,
    refresh,
    offset,
    nextPage,
    prevPage,
    resetOffset,
    hasMore,
  } = useAdminResource<ScrimRow, { scrims: ScrimRow[] }>('/api/admin/scrims', {
    limit: 25,
    // La liste plafonnait à 50 sans total ni pagination : au-delà, les scrims
    // les plus anciens disparaissaient sans que rien ne l'indique.
    includeTotal: true,
    params: {
      search: searchFilter,
      status: statusFilter,
      orderBy,
      orderDir,
      ...periodParams,
    },
    select: (res) => res.scrims || [],
  });

  // Recherche soumise explicitement, et non à la frappe : `useUrlFilters`
  // pousse une entrée d'historique à chaque écriture — un debounce y écrirait
  // un cran de « retour arrière » par syllabe tapée.
  const submitSearch = useCallback(() => {
    const next = searchInput.trim();
    // `setFilters` pousse toujours : sans cette garde, un simple passage de
    // focus sur le champ ajouterait une entrée d'historique identique.
    if (next === searchFilter) return;
    setFilters({ sq: next || null });
    resetOffset();
  }, [searchInput, searchFilter, setFilters, resetOffset]);

  // Deep-link : `?new=1` (ancienne route /create) ouvre la modale de création.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.new) setModalOpen(true);
  }, [router.isReady, router.query.new]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    if (router.query.new) {
      const { new: _omit, ...rest } = router.query;
      void router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true }
      );
    }
  }, [router]);

  return (
    <>
      <ScrimFormModal
        open={modalOpen}
        onClose={closeModal}
        onCreated={refresh}
      />

      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors"
        >
          {t.newScrim}
        </button>
      </div>

      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label
            className="block text-sm text-neutral-400 mb-1"
            htmlFor="scrims-search"
          >
            {t.searchLabel}
          </label>
          <input
            id="scrims-search"
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

        <div className="min-w-[160px]">
          <label
            className="block text-sm text-neutral-400 mb-1"
            htmlFor="scrims-status"
          >
            {t.statusFilterLabel}
          </label>
          <select
            id="scrims-status"
            value={statusFilter}
            onChange={(e) => setFilters({ sstatus: e.target.value || null })}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600"
          >
            <option value="">{t.filterAll}</option>
            <option value="draft">{t.statusDraft}</option>
            <option value="scheduled">{t.statusScheduled}</option>
            <option value="running">{t.statusRunning}</option>
            <option value="completed">{t.statusCompleted}</option>
            <option value="cancelled">{t.statusCancelled}</option>
          </select>
        </div>

        <div className="min-w-[150px]">
          <label
            className="block text-sm text-neutral-400 mb-1"
            htmlFor="scrims-period"
          >
            {t.periodFilterLabel}
          </label>
          <select
            id="scrims-period"
            value={periodFilter}
            onChange={(e) => setFilters({ speriod: e.target.value || null })}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600"
          >
            <option value="">{t.filterAll}</option>
            <option value="upcoming">{t.periodUpcoming}</option>
            <option value="past">{t.periodPast}</option>
          </select>
        </div>

        <div className="min-w-[180px]">
          <label
            className="block text-sm text-neutral-400 mb-1"
            htmlFor="scrims-sort"
          >
            {t.sortLabel}
          </label>
          <select
            id="scrims-sort"
            value={sortFilter}
            onChange={(e) => setFilters({ ssort: e.target.value || null })}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600"
          >
            <option value="created_desc">{t.sortCreatedDesc}</option>
            <option value="scheduled_desc">{t.sortScheduledDesc}</option>
            <option value="scheduled_asc">{t.sortScheduledAsc}</option>
          </select>
        </div>
      </section>

      <AdminListShell
        loading={loading}
        error={errorMsg}
        isEmpty={scrims.length === 0}
        loadingLabel={t.loading}
        // « Aucun scrim » et « aucun scrim CORRESPONDANT » n'appellent pas la
        // même réaction : le second se répare en effaçant un filtre.
        emptyTitle={hasActiveFilters ? t.emptyFiltered : t.empty}
      >
        <div className="grid gap-3">
          {scrims.map((s) => (
            <Link
              key={s.id}
              href={`/admin/scrims/${s.id}`}
              className="block bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 rounded-xl px-5 py-4 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold ${statusColor(
                      s.status
                    )}`}
                  >
                    {statusLabel(s.status, t)}
                  </span>
                  <span className="font-medium">{s.name}</span>
                  {s.is_public && (
                    <span className="text-xs text-emerald-400">
                      {t.publicBadge}
                    </span>
                  )}
                  {/* Un scrim classé compte pour le rating des joueuses et
                      pour la saison : ça ne doit pas se deviner. */}
                  {s.ranked && (
                    <span className="text-xs px-1.5 py-0.5 rounded border border-amber-600/60 text-amber-300">
                      {t.rankedBadge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-400">
                  {formatDate(s.scheduled_date)}
                </div>
              </div>
              <div className="mt-2 text-sm text-neutral-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {format(t.teamsVs, {
                    team1: s.team1?.name || '—',
                    team2: s.team2?.name || '—',
                  })}
                </span>
                {/* Le résultat d'un scrim terminé n'apparaissait nulle part
                    dans la liste : il fallait ouvrir la fiche pour le savoir. */}
                {s.status === 'completed' &&
                  (hasScore(s) ? (
                    <span className="font-semibold tabular-nums">
                      {s.team1_score} – {s.team2_score}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400/80">
                      {t.noResultYet}
                    </span>
                  ))}
              </div>
            </Link>
          ))}
        </div>
        <AdminPagination
          offset={offset}
          count={scrims.length}
          total={total}
          hasMore={hasMore}
          loading={loading}
          onPrev={prevPage}
          onNext={nextPage}
          labels={{ prev: t.pagePrev, next: t.pageNext, info: t.pageInfo }}
        />
      </AdminListShell>

      {scrims.length === 0 && hasActiveFilters && !loading && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() =>
              setFilters({ sq: null, sstatus: null, speriod: null })
            }
            className="text-sm text-blue-400 hover:underline"
          >
            {t.resetFilters}
          </button>
        </div>
      )}
    </>
  );
}
