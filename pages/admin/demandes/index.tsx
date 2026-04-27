// pages/admin/demandes/index.tsx

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { supabaseAdmin, supabaseClient } from '@/utils/supabase';
import { withStaffPage } from '@/utils/staff';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useToast } from '@/components/Toast';

type DemandeType =
  | 'join_team'
  | 'leave_team'
  | 'captain_request'
  | 'team_registration'
  | 'scrim';

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
    from_team_id?: string;
    from_team_name?: string;
    target_team_name?: string;
    preferred_date?: string | null;
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

type Props = {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
  initialDemandes: Demande[];
  initialTotal: number | null;
  tournaments: TournamentMini[];
  initialError: string | null;
};

const D_FILTER_KEYS = [
  'type',
  'status',
  'tournamentId',
  'search',
  'from',
  'to',
  'offset',
] as const;
const LIMIT = 50;

export const getServerSideProps = withStaffPage('manager', async (ctx) => {
  const { query } = ctx;
  const type = typeof query.type === 'string' ? query.type : '';
  const statusRaw = typeof query.status === 'string' ? query.status : 'pending';
  const tournamentId =
    typeof query.tournamentId === 'string' ? query.tournamentId : '';
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const from = typeof query.from === 'string' ? query.from : '';
  const to = typeof query.to === 'string' ? query.to : '';
  const offset = Math.max(0, Number(query.offset) || 0);

  if (!supabaseAdmin) {
    return {
      initialDemandes: [],
      initialTotal: null,
      tournaments: [],
      initialError: 'Service indisponible',
    };
  }

  const baseColumns = `
    id, user_id, team_id, tournament_id, type, status,
    comment, payload, created_at, updated_at,
    team:teams!demandes_team_id_fkey(id, name, short_name, logo_url),
    tournament:tournaments!demandes_tournament_id_fkey(id, name, slug)
  `;

  let q = supabaseAdmin
    .from('demandes')
    .select(baseColumns, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1);

  if (statusRaw) q = q.eq('status', statusRaw);
  if (type) q = q.eq('type', type);
  if (tournamentId) q = q.eq('tournament_id', tournamentId);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  if (search) {
    const s = `%${search}%`;
    q = q.or(`comment.ilike.${s},staff_note.ilike.${s}`);
  }

  const [demandesRes, tournamentsRes] = await Promise.all([
    q,
    supabaseAdmin
      .from('tournaments')
      .select('id, name, slug')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (demandesRes.error) {
    console.error('admin demandes SSR error:', demandesRes.error);
    return {
      initialDemandes: [],
      initialTotal: null,
      tournaments: (tournamentsRes.data || []) as TournamentMini[],
      initialError: 'Erreur lors du chargement',
    };
  }

  return {
    initialDemandes: (demandesRes.data || []) as unknown as Demande[],
    initialTotal:
      typeof demandesRes.count === 'number' ? demandesRes.count : null,
    tournaments: (tournamentsRes.data || []) as TournamentMini[],
    initialError: null,
  };
});

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
    case 'team_registration':
      return 'Inscription';
    case 'scrim':
      return 'Scrim';
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
    case 'team_registration':
      return 'bg-blue-600/20 text-blue-300 border border-blue-500/30';
    case 'scrim':
      return 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30';
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

function AdminDemandesPage({
  initialDemandes,
  initialTotal,
  tournaments,
  initialError,
}: Props) {
  const { addToast } = useToast();
  const router = useRouter();
  const { filters, setFilter, setFilters } = useUrlFilters(D_FILTER_KEYS);

  const typeFilter = filters.type ?? '';
  const statusFilter = filters.status ?? 'pending';
  const tournamentFilter = filters.tournamentId ?? '';
  const search = filters.search ?? '';
  const dateFrom = filters.from ?? '';
  const dateTo = filters.to ?? '';
  const offset = Math.max(0, Number(filters.offset) || 0);
  const limit = LIMIT;
  const loadingTournaments = false;

  const demandes = initialDemandes;
  const total = initialTotal;
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [searchInput, setSearchInput] = useState(search);
  const loading = false;

  // Batch selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  async function fetchDemandes() {
    // Trigger a refresh by re-running getServerSideProps
    await router.replace(router.asPath, undefined, { scroll: false });
  }

  async function getToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    return session?.access_token ?? null;
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

  async function handleBatchAction(newStatus: 'approved' | 'rejected') {
    if (selected.size === 0) return;
    setBatchProcessing(true);
    setErrorMsg(null);

    try {
      const token = await getToken();
      const res = await fetch('/api/admin/demandes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'updateStatus',
          demandeIds: Array.from(selected),
          newStatus,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur');
      }

      const json = await res.json();
      addToast(
        `${json.updatedCount} demande(s) ${newStatus === 'approved' ? 'approuvee(s)' : 'refusee(s)'}.`,
        'success'
      );
      setSelected(new Set());
      fetchDemandes();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur');
    } finally {
      setBatchProcessing(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ search: searchInput.trim() || null, offset: null });
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

    const url = '/api/admin/demandes?' + params.toString();
    const token = await getToken();

    if (token) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'demandes.csv';
        a.click();
      } catch (e) {
        console.error('CSV export error', e);
      }
    } else {
      window.location.href = url;
    }
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
              <span className="flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchDemandes()}
                className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
              >
                Réessayer
              </button>
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
                  onChange={(e) =>
                    setFilters({ type: e.target.value || null, offset: null })
                  }
                >
                  <option value="">Tous les types</option>
                  <option value="captain_request">Devenir capitaine</option>
                  <option value="join_team">Rejoindre une equipe</option>
                  <option value="leave_team">Quitter une equipe</option>
                  <option value="team_registration">Inscription tournoi</option>
                  <option value="scrim">Scrim</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={statusFilter}
                  onChange={(e) =>
                    setFilters({ status: e.target.value || null, offset: null })
                  }
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
                  onChange={(e) =>
                    setFilters({
                      tournamentId: e.target.value || null,
                      offset: null,
                    })
                  }
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
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
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
                  onChange={(e) =>
                    setFilters({ from: e.target.value || null, offset: null })
                  }
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
                  onChange={(e) =>
                    setFilters({ to: e.target.value || null, offset: null })
                  }
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

          {/* Batch action bar */}
          {selected.size > 0 && (
            <div className="mb-4 flex items-center gap-3 bg-blue-900/30 border border-blue-500/30 rounded-xl px-4 py-3">
              <span className="text-sm font-medium">
                {selected.size} selectionne{selected.size > 1 ? 's' : ''}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => handleBatchAction('approved')}
                disabled={batchProcessing}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Approuver
              </button>
              <button
                type="button"
                onClick={() => handleBatchAction('rejected')}
                disabled={batchProcessing}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Refuser
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
              >
                Deselectionner
              </button>
            </div>
          )}

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
                {/* Select all header */}
                <div className="px-4 py-3 bg-neutral-800/80 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.size === demandes.length && demandes.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-900"
                  />
                  <span className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                    Tout selectionner
                  </span>
                </div>

                {demandes.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                      selected.has(d.id) ? 'bg-blue-900/10' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                      className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 flex-shrink-0"
                    />

                    <Link
                      href={`/admin/demandes/${d.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0"
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
                        {d.type === 'scrim' && d.payload?.from_team_name && (
                          <>
                            <span className="flex items-center gap-1.5">
                              <span className="text-cyan-300">
                                {d.payload.from_team_name}
                              </span>
                              <span className="text-neutral-500">→</span>
                              <span>
                                {d.team?.name ||
                                  d.payload.target_team_name ||
                                  'Equipe cible'}
                              </span>
                            </span>
                            {d.payload.preferred_date && (
                              <>
                                <span>•</span>
                                <span className="text-cyan-300/80 text-xs">
                                  {new Date(
                                    d.payload.preferred_date
                                  ).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </>
                            )}
                            <span>•</span>
                          </>
                        )}
                        {d.team && d.type !== 'scrim' && (
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
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() =>
                setFilter(
                  'offset',
                  String(Math.max(0, offset - limit)) || null
                )
              }
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
              onClick={() => setFilter('offset', String(offset + limit))}
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
