// components/admin/scrims/ScrimPlanningsListPanel.tsx
// Panneau (onglet) : liste des grilles de planification de scrim
// (« When2Meet » partagé). Extrait de l'ancienne page
// /admin/scrims/plannings/index.tsx pour être hébergé comme onglet de la page
// /admin/scrims. Auto-suffisant : fetch, filtre, liste et modale de création.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import PlanningFormModal from '@/components/admin/scrims/PlanningFormModal';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { ScrimPlanning } from '@/types/admin';

type Dict = ReturnType<typeof useAdminT<'adminScrimPlanningsList'>>;
type TeamOption = { id: string; name: string };

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

export default function ScrimPlanningsListPanel() {
  const t = useAdminT('adminScrimPlanningsList');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);

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

  // Ouvre automatiquement la modale (une seule fois) quand `?new=1` est présent.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.new === '1') setModalOpen(true);
  }, [router.isReady, router.query.new]);

  function closeModal() {
    setModalOpen(false);
    // Nettoie les paramètres de préremplissage pour qu'une réouverture manuelle
    // reparte d'un formulaire vierge (et ne rouvre pas la modale au remount).
    if (router.query.new || prefillTeam1 || prefillTeam2 || prefillDemande) {
      const {
        new: _new,
        team1: _team1,
        team2: _team2,
        fromDemande: _fromDemande,
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
    loading,
    error: errorMsg,
    refresh,
  } = useAdminResource<ScrimPlanning, { plannings: ScrimPlanning[] }>(
    '/api/admin/scrim-plannings',
    {
      limit: 50,
      includeTotal: false,
      params: { status: statusFilter },
      select: (res) => res.plannings || [],
    }
  );

  // Résolution des noms d'équipes (l'API liste renvoie des rows brutes).
  useEffect(() => {
    adminFetchJson<{ teams: TeamOption[] }>(
      '/api/admin/teams?limit=200&isActive=true'
    )
      .then((json) => setTeams(json.teams || []))
      .catch(() => setTeams([]));
  }, [adminFetchJson]);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((tm) => [tm.id, tm.name]));
    return (id: string | null) => (id ? map.get(id) || '—' : '—');
  }, [teams]);

  return (
    <>
      <PlanningFormModal
        open={modalOpen}
        onClose={closeModal}
        onCreated={refresh}
        initialTeam1Id={prefillTeam1}
        initialTeam2Id={prefillTeam2}
        sourceDemandeId={prefillDemande}
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

      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-6 flex gap-3 items-end">
        <div className="min-w-[180px]">
          <label className="block text-sm text-neutral-400 mb-1">
            {t.statusFilterLabel}
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
        emptyTitle={t.empty}
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
                    team1: teamName(p.team1_id),
                    team2: teamName(p.team2_id),
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
      </AdminListShell>
    </>
  );
}
