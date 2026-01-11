// pages/admin/tournament/[id]/matches.ts

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';

type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type StageSummary = {
  id: string;
  name: string;
  stage_type: StageType | null;
  order_index: number | null;
};

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type Match = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  stage?: StageSummary | null;
  round_number: number | null;
  status: MatchStatus;
  best_of: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1?: TeamMini | null;
  team2?: TeamMini | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

type MatchesApiResponse = {
  tournament: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
  stages: StageSummary[];
  matches: Match[];
  total: number | null;
};

export const getServerSideProps = withStaffPage('manager');

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'A venir';
    case 'ongoing':
      return 'En cours';
    case 'finished':
      return 'Termine';
    case 'cancelled':
      return 'Annule';
    default:
      return status;
  }
}

function statusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-600 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-600 text-white';
    case 'finished':
      return 'bg-emerald-600 text-white';
    case 'cancelled':
      return 'bg-red-600 text-white';
    default:
      return 'bg-neutral-600 text-neutral-100';
  }
}

function stageLabel(stage: StageSummary | null | undefined) {
  if (!stage) return '—';
  const base = stage.name;
  if (stage.stage_type === 'swiss') {
    return `${base} (Swiss)`;
  }
  if (stage.stage_type === 'bracket') {
    return `${base} (Bracket)`;
  }
  if (stage.stage_type === 'group') {
    return `${base} (Groupes)`;
  }
  return base;
}

function AdminTournamentMatchesPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [tournament, setTournament] =
    useState<MatchesApiResponse['tournament']>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // filters
  const [stageFilter, setStageFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roundFilter, setRoundFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  // auto-scheduler
  const [autoSchedRunning, setAutoSchedRunning] = useState(false);
  const [autoSchedMsg, setAutoSchedMsg] = useState<string | null>(null);

  async function fetchMatches() {
    if (!id) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('includeStages', '1');
      params.set('includeTotal', '1');
      params.set('includeTeams', '1');
      if (stageFilter) params.set('stageId', stageFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (roundFilter) params.set('roundNumber', roundFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(
        `/api/admin/tournament/${id}/matches?` + params.toString()
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les matches');
      }

      const json: MatchesApiResponse = await res.json();
      setTournament(json.tournament);
      setStages(json.stages || []);
      setMatches(json.matches || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, offset, stageFilter, statusFilter, roundFilter]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchMatches();
  }

  async function handleAutoSchedule() {
    if (!id) return;
    setAutoSchedRunning(true);
    setAutoSchedMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}/auto-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de l'auto-scheduler");
      }

      const json = await res.json();
      setAutoSchedMsg(
        `Auto-scheduler termine : ${json.scheduledMatchesCount ?? 0} matches planifies.`
      );
      fetchMatches();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur lors de l'auto-scheduler");
    } finally {
      setAutoSchedRunning(false);
    }
  }

  const backUrl = `/admin/tournament/${id}`;

  return (
    <>
      <Head>
        <title>Admin – Matches du tournoi</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push(backUrl)}
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

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Matches du tournoi
                </h1>
                {tournament && (
                  <p className="text-neutral-400 text-sm mt-1">
                    {tournament.name}
                    {tournament.slug && (
                      <span className="ml-2 font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                        /{tournament.slug}
                      </span>
                    )}
                    {total !== null && (
                      <span className="ml-2">• {total} match{total > 1 ? 'es' : ''}</span>
                    )}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleAutoSchedule}
                disabled={autoSchedRunning}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {autoSchedRunning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Planning en cours...
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
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Auto-scheduler
                  </>
                )}
              </button>
            </div>
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
          {autoSchedMsg && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-emerald-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {autoSchedMsg}
            </div>
          )}

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleFilterSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Phase (stage)
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                >
                  <option value="">Toutes les phases</option>
                  {stages
                    .slice()
                    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {stageLabel(s)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Tous les statuts</option>
                  <option value="pending">A venir</option>
                  <option value="ongoing">En cours</option>
                  <option value="finished">Termine</option>
                  <option value="cancelled">Annule</option>
                </select>
              </div>

              <div className="w-24">
                <label className="block text-sm text-neutral-400 mb-1">
                  Round
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={roundFilter}
                  onChange={(e) => setRoundFilter(e.target.value)}
                  placeholder="#"
                />
              </div>

              <div className="flex-1 min-w-[200px]">
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
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Equipe, ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                  Filtrer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStageFilter('');
                    setStatusFilter('');
                    setRoundFilter('');
                    setSearch('');
                    setOffset(0);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
                >
                  Reset
                </button>
              </div>
            </form>
          </section>

          {/* Matches List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : matches.length === 0 ? (
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
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Aucun match trouve pour ces filtres.
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {matches.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 hover:bg-neutral-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Stage & Round info */}
                      <div className="w-40 flex-shrink-0">
                        <div className="font-medium text-sm">{stageLabel(m.stage)}</div>
                        <div className="text-xs text-neutral-400">
                          Round {m.round_number ?? '—'}
                          {m.best_of ? ` • BO${m.best_of}` : ''}
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono mt-1">
                          #{m.id.slice(0, 8)}
                        </div>
                      </div>

                      {/* Teams & Score */}
                      <div className="flex-1 flex items-center justify-center gap-4 min-w-[300px]">
                        <TeamCell
                          team={m.team1}
                          fallbackId={m.team1?.name || undefined}
                          isWinner={m.winner_team_id === m.team1_id}
                          align="right"
                        />

                        <div className="flex flex-col items-center">
                          <div className="text-xl font-bold px-4 py-1 bg-neutral-900/50 rounded-lg">
                            {typeof m.team1_score === 'number' ||
                            typeof m.team2_score === 'number'
                              ? `${m.team1_score ?? 0} - ${m.team2_score ?? 0}`
                              : 'vs'}
                          </div>
                          <span
                            className={`mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                              m.status
                            )}`}
                          >
                            {statusLabel(m.status)}
                          </span>
                        </div>

                        <TeamCell
                          team={m.team2}
                          fallbackId={m.team2?.name || undefined}
                          isWinner={m.winner_team_id === m.team2_id}
                          align="left"
                        />
                      </div>

                      {/* Schedule */}
                      <div className="w-32 text-right flex-shrink-0">
                        <div className="text-sm text-neutral-300">
                          {formatDateTime(m.scheduled_at)}
                        </div>
                        {m.completed_at && (
                          <div className="text-[10px] text-neutral-500">
                            Termine {formatDateTime(m.completed_at)}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        <Link
                          href={`/admin/matches/${m.id}`}
                          className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs font-medium transition-colors"
                        >
                          Editer
                        </Link>
                        <Link
                          href={`/match/${m.id}`}
                          target="_blank"
                          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium transition-colors"
                        >
                          Voir
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          {matches.length > 0 && (
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
                {offset + 1} – {offset + matches.length}
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
          )}
        </div>
      </div>
    </>
  );
}

type TeamCellProps = {
  team: TeamMini | null | undefined;
  fallbackId: string | null | undefined;
  isWinner: boolean;
  align?: 'left' | 'right';
};

function TeamCell({ team, fallbackId, isWinner, align = 'left' }: TeamCellProps) {
  const label = team?.name || fallbackId || 'TBD';
  const short = team?.short_name || null;

  return (
    <div className={`flex items-center gap-3 w-40 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      {team?.logo_url ? (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={40}
          height={40}
          className="w-10 h-10 rounded-xl object-cover border border-neutral-700"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-neutral-700/50 border border-neutral-700 flex items-center justify-center text-xs font-semibold uppercase">
          {(label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-sm truncate ${isWinner ? 'text-emerald-400' : ''}`}>
          {label}
        </div>
        {short && <div className="text-xs text-neutral-500 truncate">{short}</div>}
      </div>
    </div>
  );
}

export default AdminTournamentMatchesPage;
