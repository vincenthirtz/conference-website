// pages/admin/tournament/[id]/checkin.tsx
// Admin overview of per-match check-in status for a tournament.
// Shows progress (email sent, reminders, checked-in teams, forfeit) and
// provides a "Process now" button to manually run the cron.

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import type { StaffProps } from '@/types/admin';

type CheckinRow = {
  matchId: string;
  scheduledAt: string | null;
  status: string;
  team1: { id: string | null; name: string | null; checkedInAt: string | null };
  team2: { id: string | null; name: string | null; checkedInAt: string | null };
  emailSentAt: string | null;
  reminder30At: string | null;
  reminder15At: string | null;
  forfeitProcessedAt: string | null;
};

type ApiResponse = { matches: CheckinRow[] };

export const getServerSideProps = withStaffPage('manager');

function formatDateFr(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

function formatTimeFr(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'À venir',
        className: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
      };
    case 'ongoing':
      return {
        label: 'En cours',
        className: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
      };
    case 'finished':
      return {
        label: 'Terminé',
        className: 'bg-neutral-600/20 text-neutral-400 border-neutral-500/30',
      };
    case 'walkover':
      return {
        label: 'Forfait',
        className: 'bg-red-700/30 text-red-200 border-red-500/30',
      };
    case 'cancelled':
      return {
        label: 'Annulé',
        className: 'bg-amber-700/30 text-amber-200 border-amber-500/30',
      };
    default:
      return {
        label: status,
        className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
      };
  }
}

function CheckinStatusPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutate: processCheckin } = useIdempotentMutation();

  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming');

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/tournament/${tournamentId}/checkin`
      );
      setRows(json.matches || []);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function processNow() {
    if (!tournamentId) return;
    setProcessing(true);
    try {
      const res = await processCheckin(
        `/api/admin/tournament/${tournamentId}/checkin`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Échec');
      addToast(
        `Traité : ${json.scanned} matchs scannés, ${json.acted} action(s), ${json.errors} erreur(s)`,
        json.errors > 0 ? 'error' : 'success'
      );
      await fetchData();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  }

  const now = Date.now();
  const visibleRows =
    filter === 'upcoming'
      ? rows.filter(
          (r) =>
            r.status === 'pending' ||
            r.status === 'ongoing' ||
            (r.scheduledAt &&
              new Date(r.scheduledAt).getTime() > now - 86_400_000)
        )
      : rows;

  // Aggregates
  const stats = {
    total: rows.length,
    upcoming: rows.filter((r) => r.status === 'pending').length,
    bothCheckedIn: rows.filter(
      (r) => r.team1.checkedInAt && r.team2.checkedInAt
    ).length,
    noCheckin: rows.filter(
      (r) =>
        r.status === 'pending' && !r.team1.checkedInAt && !r.team2.checkedInAt
    ).length,
    forfeited: rows.filter((r) => r.forfeitProcessedAt).length,
  };

  return (
    <>
      <Head>
        <title>Admin – Check-in</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <button
            type="button"
            onClick={() => router.push(`/admin/tournament/${tournamentId}`)}
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
            Retour au tournoi
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Check-in matchs
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Suivi des présences et auto-forfaits. Le processeur tourne tout
                seul (cron Netlify), mais vous pouvez forcer un passage ici.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/checkin/live`}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors"
              >
                Live console ↗
              </Link>
              <button
                type="button"
                onClick={fetchData}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
              >
                Rafraîchir
              </button>
              <button
                type="button"
                onClick={processNow}
                disabled={processing}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {processing ? 'Traitement...' : 'Lancer maintenant'}
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Stat label="Matchs" value={stats.total} />
            <Stat label="À venir" value={stats.upcoming} accent="blue" />
            <Stat
              label="Tous check-in"
              value={stats.bothCheckedIn}
              accent="emerald"
            />
            <Stat
              label="Aucun check-in"
              value={stats.noCheckin}
              accent="amber"
            />
            <Stat label="Forfaits auto" value={stats.forfeited} accent="red" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setFilter('upcoming')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === 'upcoming'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              À venir
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              Tous
            </button>
            <span className="ml-auto text-xs text-neutral-500">
              {visibleRows.length} matchs
            </span>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="text-center py-20 text-neutral-500 text-sm">
              Aucun match à afficher.
            </div>
          ) : (
            <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-800/80 text-xs uppercase tracking-wide text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Match</th>
                      <th className="px-4 py-3 text-center">Statut</th>
                      <th className="px-4 py-3 text-center">Email</th>
                      <th className="px-4 py-3 text-center">T-30</th>
                      <th className="px-4 py-3 text-center">T-15</th>
                      <th className="px-4 py-3 text-center">Team1</th>
                      <th className="px-4 py-3 text-center">Team2</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {visibleRows.map((r) => {
                      const badge = statusBadge(r.status);
                      return (
                        <tr key={r.matchId} className="hover:bg-neutral-700/20">
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-300">
                            {formatDateFr(r.scheduledAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-white text-sm">
                              {r.team1.name || '—'}{' '}
                              <span className="text-neutral-500">vs</span>{' '}
                              {r.team2.name || '—'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            {r.emailSentAt ? (
                              <span className="text-emerald-300">
                                {formatTimeFr(r.emailSentAt)}
                              </span>
                            ) : (
                              <span className="text-neutral-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            {r.reminder30At ? (
                              <span className="text-amber-300">
                                {formatTimeFr(r.reminder30At)}
                              </span>
                            ) : (
                              <span className="text-neutral-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            {r.reminder15At ? (
                              <span className="text-red-300">
                                {formatTimeFr(r.reminder15At)}
                              </span>
                            ) : (
                              <span className="text-neutral-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <CheckinDot at={r.team1.checkedInAt} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <CheckinDot at={r.team2.checkedInAt} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/admin/matches/${r.matchId}/edit`}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Voir
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-neutral-500 mt-6 text-center">
            Le processeur cron tourne automatiquement toutes les 5 minutes via
            Netlify Scheduled Functions. Les matchs sans{' '}
            <code>scheduled_at</code> sont ignorés.
          </p>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'blue' | 'emerald' | 'amber' | 'red';
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  };
  const accentColor = accent ? colors[accent] : 'text-white';
  return (
    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
      <p className="text-xs text-neutral-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${accentColor}`}>{value}</p>
    </div>
  );
}

function CheckinDot({ at }: { at: string | null }) {
  if (at) {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600/20 border border-emerald-500/40"
        title={`Check-in à ${formatTimeFr(at)}`}
      >
        <svg
          className="w-3 h-3 text-emerald-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-neutral-700" />;
}

export default CheckinStatusPage;
