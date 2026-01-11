// pages/admin/demandes/index.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type DemandeType = 'join_team' | 'leave_team' | 'captain_request';

type DemandeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type UserMini = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  discord_tag?: string | null;
  battlefy_name?: string | null;
};

type StaffMini = {
  id: string;
  display_name: string | null;
};

type Demande = {
  id: string;
  type: DemandeType;
  status: DemandeStatus;
  created_at: string;
  updated_at: string | null;
  tournament_id: string | null;
  team_id: string | null;
  user_id: string | null;
  message: string | null;
  comment: string | null;
  metadata: any | null;
  payload?: {
    team_name?: string;
    user_email?: string;
    user_display_name?: string;
    request_type?: 'existing_team' | 'new_team';
    existing_team_id?: string;
    existing_team_name?: string;
    members?: Array<{
      email: string;
      battle_tag?: string;
      display_name?: string;
    }>;
  } | null;
  handled_at?: string | null;
  handled_by?: StaffMini | null;

  tournament?: TournamentMini | null;
  team?: TeamMini | null;
  user?: UserMini | null;
};

type DemandesApiResponse = {
  demandes: Demande[];
  total: number | null;
};

type TournamentsApiResponse = {
  tournaments: TournamentMini[];
  total: number | null;
};

export const getServerSideProps = withStaffPage('manager');

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
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

function typeLabel(type: DemandeType) {
  switch (type) {
    case 'join_team':
      return 'Rejoindre';
    case 'leave_team':
      return 'Quitter';
    case 'captain_request':
      return 'Capitaine';
    default:
      return type;
  }
}

function typeColor(type: DemandeType) {
  switch (type) {
    case 'join_team':
      return 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30';
    case 'leave_team':
      return 'bg-amber-600/20 text-amber-300 border border-amber-500/30';
    case 'captain_request':
      return 'bg-purple-600/20 text-purple-300 border border-purple-500/30';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function statusLabel(status: DemandeStatus) {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'approved':
      return 'Approuvee';
    case 'rejected':
      return 'Refusee';
    case 'cancelled':
      return 'Annulee';
    default:
      return status;
  }
}

function statusColor(status: DemandeStatus) {
  switch (status) {
    case 'pending':
      return 'bg-blue-600 text-white';
    case 'approved':
      return 'bg-emerald-600 text-white';
    case 'rejected':
      return 'bg-red-600 text-white';
    case 'cancelled':
      return 'bg-neutral-600 text-neutral-200';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function AdminDemandesPage() {
  const router = useRouter();

  // Guard auth cote client
  const [guardLoading, setGuardLoading] = useState(true);
  const [staff, setStaff] = useState<StaffShape | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Donnees page
  const [loading, setLoading] = useState(true);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // Filtres
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [tournamentFilter, setTournamentFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // 1) Guard staff : check session + /api/admin/me
  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (!session?.access_token) {
          router.push('/admin/login');
          return;
        }

        const accessToken = session.access_token;
        setToken(accessToken);

        const res = await fetch('/api/admin/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          router.push('/admin/login');
          return;
        }

        const me = await res.json();

        if (!me.role) {
          router.push('/admin/login');
          return;
        }

        setStaff({
          id: (me.id as string) ?? '',
          role: me.role ?? 'caster',
          display_name: me.display_name ?? null,
        });
      } catch (e) {
        console.error('staff guard error', e);
        router.push('/admin/login');
        return;
      } finally {
        setGuardLoading(false);
      }
    };

    run();
  }, [router]);

  // 2) Charger les tournois une fois l'auth OK
  useEffect(() => {
    if (!token) return;
    fetchTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 3) Charger les demandes quand filtres changent (et auth OK)
  useEffect(() => {
    if (!token) return;
    fetchDemandes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, statusFilter, typeFilter, tournamentFilter, token]);

  async function fetchTournaments() {
    try {
      setLoadingTournaments(true);
      const res = await fetch('/api/admin/tournaments?limit=200', {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });
      if (!res.ok) return;
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (e) {
      console.error('Failed to load tournaments for filter', e);
    } finally {
      setLoadingTournaments(false);
    }
  }

  async function fetchDemandes() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('includeUser', '1');
      params.set('includeTeam', '1');
      params.set('includeTournament', '1');
      params.set('includeTotal', '1');
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (tournamentFilter) params.set('tournamentId', tournamentFilter);
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const res = await fetch('/api/admin/demandes?' + params.toString(), {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les demandes');
      }
      const json: DemandesApiResponse = await res.json();
      setDemandes(json.demandes || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchDemandes();
  }

  function handleExportCsv() {
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

    const url = '/api/admin/demandes?' + params.toString();

    if (token) {
      fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.blob())
        .then((blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'demandes.csv';
          a.click();
        })
        .catch((e) => {
          console.error('CSV export error', e);
        });
    } else {
      window.location.href = url;
    }
  }

  // Etat de garde : pendant le check auth, on affiche un ecran simple
  if (guardLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Si pas de staff (et pas en train de loader) -> on ne rend rien (redir deja faite)
  if (!staff) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Admin – Demandes d&apos;equipes</title>
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
              Retour au dashboard admin
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Demandes equipes / joueurs
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? `${total} demande${total > 1 ? 's' : ''}`
                    : 'Chargement...'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-4 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2"
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* Error Message */}
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

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleFilterSubmit}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 items-end"
            >
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Type
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="">Tous les types</option>
                  <option value="captain_request">Devenir capitaine</option>
                  <option value="join_team">Rejoindre une equipe</option>
                  <option value="leave_team">Quitter une equipe</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Tous les statuts</option>
                  <option value="pending">En attente</option>
                  <option value="approved">Approuvee</option>
                  <option value="rejected">Refusee</option>
                  <option value="cancelled">Annulee</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Tournoi
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={tournamentFilter}
                  onChange={(e) => setTournamentFilter(e.target.value)}
                  disabled={loadingTournaments}
                >
                  <option value="">
                    {loadingTournaments ? 'Chargement...' : 'Tous les tournois'}
                  </option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.slug ? ` (${t.slug})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Recherche
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="Joueur, equipe..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Du
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Au
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Rechercher
              </button>
            </form>
          </section>

          {/* Demandes List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : demandes.length === 0 ? (
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Aucune demande trouvee pour ces filtres
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {demandes.map((d) => (
                  <Link
                    key={d.id}
                    href={`/admin/demandes/${d.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group"
                  >
                    {/* Icon / Avatar */}
                    <div className="flex-shrink-0">
                      {d.user?.avatar_url ? (
                        <Image
                          src={d.user.avatar_url}
                          alt={d.user.display_name || 'User'}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                          <svg
                            className="w-6 h-6 text-neutral-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                          {d.user?.display_name || d.user_id || 'Utilisateur inconnu'}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                            d.status
                          )}`}
                        >
                          {statusLabel(d.status)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(
                            d.type
                          )}`}
                        >
                          {typeLabel(d.type)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-neutral-400 flex-wrap">
                        {d.team && (
                          <>
                            <span className="flex items-center gap-1">
                              {d.team.logo_url && (
                                <Image
                                  src={d.team.logo_url}
                                  alt={d.team.name}
                                  width={16}
                                  height={16}
                                  className="w-4 h-4 rounded object-cover"
                                />
                              )}
                              {d.team.name}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        {d.type === 'captain_request' && d.payload && !d.team && (
                          <>
                            <span className="text-purple-300">
                              {d.payload.request_type === 'existing_team'
                                ? d.payload.existing_team_name
                                : d.payload.team_name}
                              {d.payload.request_type === 'new_team' && ' (a creer)'}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        {d.tournament && (
                          <>
                            <span>{d.tournament.name}</span>
                            <span>•</span>
                          </>
                        )}
                        <span className="text-xs">{formatDateTime(d.created_at)}</span>
                      </div>
                      {d.message && (
                        <p className="text-xs text-neutral-500 mt-1 truncate max-w-xl">
                          {d.message}
                        </p>
                      )}
                    </div>

                    {/* Handler info */}
                    {d.handled_by && (
                      <div className="hidden sm:block text-xs text-neutral-500 text-right flex-shrink-0">
                        <div>
                          par{' '}
                          <span className="text-neutral-300">
                            {d.handled_by.display_name || d.handled_by.id}
                          </span>
                        </div>
                        {d.handled_at && (
                          <div className="text-neutral-600">
                            {formatDateTime(d.handled_at)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Arrow */}
                    <svg
                      className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors flex-shrink-0"
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
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
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
              Precedent
            </button>

            <span className="text-neutral-400 text-sm">
              {offset + 1} – {offset + demandes.length}
              {total ? ` sur ${total}` : ''}
            </span>

            <button
              type="button"
              disabled={total !== null && offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Suivant
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
        </div>
      </div>
    </>
  );
}

export default AdminDemandesPage;
