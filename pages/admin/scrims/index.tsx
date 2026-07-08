// pages/admin/scrims/index.tsx
// Admin: liste des scrims (sessions de matchs amicaux).

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminResource } from '@/hooks/useAdminResource';
import { withStaffPage } from '@/utils/staff';
import ScrimFormModal from '@/components/admin/scrims/ScrimFormModal';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps, ScrimStatus } from '@/types/admin';

type Dict = ReturnType<typeof useAdminT<'adminScrimsList'>>;

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

export const getServerSideProps = withStaffPage('manager');

function AdminScrimsPage(_props: StaffProps) {
  const t = useAdminT('adminScrimsList');
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);

  // `statusFilter` reste un filtre serveur (param `status`), comme avant.
  // `limit: 50` réplique le défaut de l'API (l'ancienne requête n'envoyait
  // pas de limite) ; pas de pagination UI sur cette liste.
  const {
    data: scrims,
    loading,
    error: errorMsg,
    refresh,
  } = useAdminResource<ScrimRow, { scrims: ScrimRow[] }>('/api/admin/scrims', {
    limit: 50,
    includeTotal: false,
    params: { status: statusFilter },
    select: (res) => res.scrims || [],
  });

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
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <ScrimFormModal
        open={modalOpen}
        onClose={closeModal}
        onCreated={refresh}
      />
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {t.heading}
              </h1>
              <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors"
            >
              {t.newScrim}
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
                <option value="draft">{t.statusDraft}</option>
                <option value="scheduled">{t.statusScheduled}</option>
                <option value="running">{t.statusRunning}</option>
                <option value="completed">{t.statusCompleted}</option>
                <option value="cancelled">{t.statusCancelled}</option>
              </select>
            </div>
          </section>

          <AdminListShell
            loading={loading}
            error={errorMsg}
            isEmpty={scrims.length === 0}
            loadingLabel={t.loading}
            emptyTitle={t.empty}
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
                    </div>
                    <div className="text-xs text-neutral-400">
                      {formatDate(s.scheduled_date)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-neutral-300">
                    {format(t.teamsVs, {
                      team1: s.team1?.name || '—',
                      team2: s.team2?.name || '—',
                    })}
                  </div>
                </Link>
              ))}
            </div>
          </AdminListShell>
        </div>
      </div>
    </>
  );
}

export default AdminScrimsPage;
