// pages/admin/tournament/[id]/matches.ts

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge';
import Button from '@/components/Buttons/button';

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
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'À venir';
    case 'ongoing':
      return 'En cours';
    case 'finished':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
    default:
      return status;
  }
}

function statusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-700 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-600/80 text-neutral-900';
    case 'finished':
      return 'bg-emerald-600/80 text-white';
    case 'cancelled':
      return 'bg-red-700/80 text-white';
    default:
      return 'bg-neutral-700 text-neutral-100';
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
        body: JSON.stringify({}), // options par défaut
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de l'auto-scheduler");
      }

      const json = await res.json();
      setAutoSchedMsg(
        `Auto-scheduler terminé : ${json.scheduledMatchesCount ?? 0} matches planifiés.`
      );
      // recharger les matches pour voir les horaires mis à jour
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

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour au tournoi
            </button>
            <h1 className="text-3xl font-bold">Matches du tournoi</h1>
            {tournament && (
              <p className="text-neutral-400 text-sm mt-1">
                Tournoi :{' '}
                <span className="font-semibold">{tournament.name}</span>
                {tournament.slug && (
                  <>
                    {' '}
                    <span className="font-mono bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded text-xs">
                      {tournament.slug}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <StaffRoleBadge staff={staff} />
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}
        {autoSchedMsg && (
          <div className="mb-4 rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
            {autoSchedMsg}
          </div>
        )}

        {/* Filters + Auto-scheduler */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6 flex flex-col gap-4">
          <form
            onSubmit={handleFilterSubmit}
            className="flex flex-wrap gap-4 items-end"
          >
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs text-neutral-400">Phase (stage)</label>
              <select
                className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            <div className="flex flex-col gap-1 w-40">
              <label className="text-xs text-neutral-400">Statut</label>
              <select
                className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                <option value="pending">À venir</option>
                <option value="ongoing">En cours</option>
                <option value="finished">Terminé</option>
                <option value="cancelled">Annulé</option>
              </select>
            </div>

            <div className="flex flex-col gap-1 w-28">
              <label className="text-xs text-neutral-400">Round #</label>
              <input
                type="number"
                className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={roundFilter}
                onChange={(e) => setRoundFilter(e.target.value)}
                placeholder="ex: 1"
              />
            </div>

            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs text-neutral-400">
                Recherche (équipes, ID…)
              </label>
              <input
                type="text"
                className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nom équipe, short name, match id..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="ml-auto flex gap-2">
              <Button type="submit" className="px-4 py-2 text-sm" size="compact">
                Filtrer
              </Button>
              <Button
                type="button"
                className="px-4 py-2 text-sm"
                size="compact"
                onClick={() => {
                  setStageFilter('');
                  setStatusFilter('');
                  setRoundFilter('');
                  setSearch('');
                  setOffset(0);
                }}
              >
                Réinitialiser
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap gap-3 items-center border-t border-neutral-700 pt-3 mt-2">
            <div className="text-xs text-neutral-400">
              Auto-scheduler : planifie automatiquement les matchs (selon les
              contraintes définies sur le tournoi).
            </div>
            <Button
              type="button"
              onClick={handleAutoSchedule}
              disabled={autoSchedRunning}
              className="px-4 py-2 text-sm font-semibold"
              size="compact"
            >
              {autoSchedRunning
                ? 'Planning en cours…'
                : 'Lancer l’auto-scheduler'}
            </Button>
          </div>
        </div>

        {/* Matches table */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
            <span className="text-sm font-semibold">
              {loading
                ? 'Chargement...'
                : `Matches (${matches.length}${
                    total != null ? ` / ${total}` : ''
                  })`}
            </span>
            <span className="text-xs text-neutral-400">
              Trié du plus récent au plus ancien par horaires / création (géré
              côté API).
            </span>
          </div>

          {matches.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-neutral-400">
              Aucun match trouvé pour ces filtres.
            </div>
          )}

          {matches.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-neutral-750 text-neutral-300">
                <tr>
                  <th className="px-4 py-2 text-left">Phase / Round</th>
                  <th className="px-4 py-2 text-left">Équipe 1</th>
                  <th className="px-4 py-2 text-left">Équipe 2</th>
                  <th className="px-4 py-2 text-left">Score</th>
                  <th className="px-4 py-2 text-left">Horaire</th>
                  <th className="px-4 py-2 text-left">Statut</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-700">
                    {/* Stage / round */}
                    <td className="px-4 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">
                          {stageLabel(m.stage)}
                        </div>
                        <div className="text-xs text-neutral-400">
                          Round {m.round_number ?? '—'}
                          {m.best_of ? ` • BO${m.best_of}` : ''}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          #{m.id.slice(0, 8)}
                        </div>
                      </div>
                    </td>

                    {/* Team 1 */}

                    <td className="px-4 py-2 align-top">
                      <TeamCell
                        team={m.team1}
                        fallbackId={m.team1?.name || undefined}
                        isWinner={m.winner_team_id === m.team1_id}
                      />
                    </td>

                    {/* Team 2 */}
                    <td className="px-4 py-2 align-top">
                      <TeamCell
                        team={m.team2}
                        fallbackId={m.team2?.name || undefined}
                        isWinner={m.winner_team_id === m.team2_id}
                      />
                    </td>

                    {/* Score */}
                    <td className="px-4 py-2 align-top">
                      <div className="font-semibold">
                        {typeof m.team1_score === 'number' ||
                        typeof m.team2_score === 'number'
                          ? `${m.team1_score ?? 0} - ${m.team2_score ?? 0}`
                          : '—'}
                      </div>
                    </td>

                    {/* Schedule */}
                    <td className="px-4 py-2 align-top text-xs text-neutral-300">
                      <div>{formatDateTime(m.scheduled_at)}</div>
                      {m.started_at && (
                        <div className="text-[11px] text-neutral-500">
                          start: {formatDateTime(m.started_at)}
                        </div>
                      )}
                      {m.completed_at && (
                        <div className="text-[11px] text-neutral-500">
                          end: {formatDateTime(m.completed_at)}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2 align-top">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(
                          m.status
                        )}`}
                      >
                        {statusLabel(m.status)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2 align-top">
                      <div className="flex flex-col gap-2 items-end">
                        <Link
                          href={`/admin/matches/${m.id}`}
                          className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
                        >
                          Ouvrir (admin)
                        </Link>
                        <Link
                          href={`/match/${m.id}`}
                          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
                          target="_blank"
                        >
                          Voir (public)
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {matches.length > 0 && (
          <div className="flex justify-between items-center mt-6 text-sm">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className={`px-3 py-2 rounded ${
                offset === 0
                  ? 'bg-neutral-700 opacity-40 cursor-not-allowed'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
            >
              ← Précédent
            </button>

            <span className="text-neutral-400">
              {offset + 1} – {offset + matches.length}
              {total ? ` / ${total}` : ''}
            </span>

            <button
              disabled={total !== null && offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className={`px-3 py-2 rounded ${
                total !== null && offset + limit >= total
                  ? 'bg-neutral-700 opacity-40 cursor-not-allowed'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

type TeamCellProps = {
  team: TeamMini | null | undefined;
  fallbackId: string | null | undefined;
  isWinner: boolean;
};

function TeamCell({ team, fallbackId, isWinner }: TeamCellProps) {
  const label = team?.name || fallbackId || 'TBD';
  const short = team?.short_name || null;

  return (
    <div className="flex items-center gap-3">
      {team?.logo_url ? (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={32}
          height={32}
          className="w-8 h-8 rounded object-cover border border-neutral-700"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-neutral-700 border border-neutral-600 flex items-center justify-center text-[11px] font-semibold uppercase">
          {(label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}
        </div>
      )}
      <div>
        <div className={`font-semibold ${isWinner ? 'text-emerald-300' : ''}`}>
          {label}
        </div>
        {short && <div className="text-xs text-neutral-400">{short}</div>}
      </div>
    </div>
  );
}

export default AdminTournamentMatchesPage;
