// pages/admin/scrims/index.tsx
// Admin: liste des scrims (sessions de matchs amicaux).

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { withStaffPage } from '@/utils/staff';
import type { StaffProps, ScrimStatus } from '@/types/admin';

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

function statusLabel(status: string) {
  switch (status) {
    case 'draft':
      return 'Brouillon';
    case 'scheduled':
      return 'Planifie';
    case 'running':
      return 'En cours';
    case 'completed':
      return 'Termine';
    case 'cancelled':
      return 'Annule';
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
  const { adminFetchJson } = useAdminFetch();
  const [scrims, setScrims] = useState<ScrimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchScrims = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const json = await adminFetchJson<{ scrims: ScrimRow[] }>(
        `/api/admin/scrims?${params.toString()}`
      );
      setScrims(json.scrims || []);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, statusFilter]);

  useEffect(() => {
    fetchScrims();
  }, [fetchScrims]);

  return (
    <>
      <Head>
        <title>Admin – Scrims</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Gestion des scrims
              </h1>
              <p className="text-neutral-400 text-sm mt-1">
                Sessions de matchs amicaux entre 2 equipes.
              </p>
            </div>
            <Link
              href="/admin/scrims/create"
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors"
            >
              + Nouveau scrim
            </Link>
          </div>

          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-6 flex gap-3 items-end">
            <div className="min-w-[180px]">
              <label className="block text-sm text-neutral-400 mb-1">
                Statut
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600"
              >
                <option value="">Tous</option>
                <option value="draft">Brouillon</option>
                <option value="scheduled">Planifie</option>
                <option value="running">En cours</option>
                <option value="completed">Termine</option>
                <option value="cancelled">Annule</option>
              </select>
            </div>
          </section>

          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="text-neutral-400 text-sm">Chargement…</div>
          ) : scrims.length === 0 ? (
            <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/30 px-6 py-12 text-center text-neutral-400">
              Aucun scrim pour ce filtre.
            </div>
          ) : (
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
                        {statusLabel(s.status)}
                      </span>
                      <span className="font-medium">{s.name}</span>
                      {s.is_public && (
                        <span className="text-xs text-emerald-400">
                          • Public
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {formatDate(s.scheduled_date)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-neutral-300">
                    {(s.team1?.name || '—') + ' vs ' + (s.team2?.name || '—')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminScrimsPage;
