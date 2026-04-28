// pages/admin/tournament/[id]/stats.tsx

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

type Tournament = {
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

type TeamStat = {
  team: TeamMini;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winrate: number;
  mapsWon: number;
  mapsLost: number;
  mapDiff: number;
};

type MapStat = {
  mapName: string;
  gamesPlayed: number;
  totalRounds: number;
  avgRounds: number;
  overtimes: number;
  tiebreakers: number;
  usageRate: number;
};

type ClosestMatch = {
  id: string;
  team1: TeamMini | null;
  team2: TeamMini | null;
  team1_score: number;
  team2_score: number;
  winner_team_id: string | null;
  stage_name: string | null;
  round_number: number | null;
};

type TournamentStats = {
  tournament: Tournament | null;
  overview: {
    totalMatches: number;
    finishedMatches: number;
    pendingMatches: number;
    ongoingMatches: number;
    totalTeams: number;
    totalGames: number;
    totalOvertimes: number;
  };
  teamStats: TeamStat[];
  mapStats: MapStat[];
  closestMatches: ClosestMatch[];
};

export const getServerSideProps = withStaffPage('manager');

function AdminTournamentStatsPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<TournamentStats | null>(null);

  async function fetchStats() {
    if (!id) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}/stats`);

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les statistiques');
      }

      const json: TournamentStats = await res.json();
      setStats(json);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const backUrl = `/admin/tournament/${id}`;

  return (
    <>
      <Head>
        <title>Admin – Statistiques du tournoi</title>
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
            <h1 className="text-3xl font-bold">Statistiques du tournoi</h1>
            {stats?.tournament && (
              <p className="text-neutral-400 text-sm mt-1">
                Tournoi :{' '}
                <span className="font-semibold">{stats.tournament.name}</span>
                {stats.tournament.slug && (
                  <>
                    {' '}
                    <span className="font-mono bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded text-xs">
                      {stats.tournament.slug}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={fetchStats}
            disabled={loading}
            className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Chargement...' : 'Actualiser'}
          </button>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {loading && !stats && (
          <div className="text-neutral-400 text-sm">
            Chargement des statistiques...
          </div>
        )}

        {stats && (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <StatCard
                label="Équipes"
                value={stats.overview.totalTeams}
                color="blue"
              />
              <StatCard
                label="Matchs total"
                value={stats.overview.totalMatches}
                color="neutral"
              />
              <StatCard
                label="Terminés"
                value={stats.overview.finishedMatches}
                color="emerald"
              />
              <StatCard
                label="En cours"
                value={stats.overview.ongoingMatches}
                color="amber"
              />
              <StatCard
                label="À venir"
                value={stats.overview.pendingMatches}
                color="neutral"
              />
              <StatCard
                label="Maps jouées"
                value={stats.overview.totalGames}
                color="purple"
              />
              <StatCard
                label="Overtimes"
                value={stats.overview.totalOvertimes}
                color="red"
              />
            </div>

            {/* Two column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Team Rankings */}
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-700">
                  <h2 className="text-lg font-semibold">
                    Classement des équipes
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Par winrate (min. 1 match joué)
                  </p>
                </div>

                {stats.teamStats.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-neutral-400">
                    Aucune statistique d&apos;équipe disponible.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-750 text-neutral-300">
                        <tr>
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Équipe</th>
                          <th className="px-4 py-2 text-center">V</th>
                          <th className="px-4 py-2 text-center">D</th>
                          <th className="px-4 py-2 text-center">Winrate</th>
                          <th className="px-4 py-2 text-center">Maps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.teamStats.map((ts, idx) => (
                          <tr
                            key={ts.team.id}
                            className="border-t border-neutral-700"
                          >
                            <td className="px-4 py-2 text-neutral-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2">
                              <TeamCell team={ts.team} />
                            </td>
                            <td className="px-4 py-2 text-center text-emerald-400 font-semibold">
                              {ts.wins}
                            </td>
                            <td className="px-4 py-2 text-center text-red-400 font-semibold">
                              {ts.losses}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <WinrateBar winrate={ts.winrate} />
                            </td>
                            <td className="px-4 py-2 text-center text-xs text-neutral-300">
                              <span
                                className={
                                  ts.mapDiff > 0
                                    ? 'text-emerald-400'
                                    : ts.mapDiff < 0
                                      ? 'text-red-400'
                                      : ''
                                }
                              >
                                {ts.mapsWon}-{ts.mapsLost} (
                                {ts.mapDiff > 0 ? '+' : ''}
                                {ts.mapDiff})
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Map Stats */}
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-700">
                  <h2 className="text-lg font-semibold">
                    Statistiques des maps
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Par nombre de parties jouées
                  </p>
                </div>

                {stats.mapStats.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-neutral-400">
                    Aucune statistique de map disponible.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-750 text-neutral-300">
                        <tr>
                          <th className="px-4 py-2 text-left">Map</th>
                          <th className="px-4 py-2 text-center">Parties</th>
                          <th className="px-4 py-2 text-center">Usage</th>
                          <th className="px-4 py-2 text-center">Moy. rounds</th>
                          <th className="px-4 py-2 text-center">OT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.mapStats.map((ms) => (
                          <tr
                            key={ms.mapName}
                            className="border-t border-neutral-700"
                          >
                            <td className="px-4 py-2 font-medium">
                              {ms.mapName}
                            </td>
                            <td className="px-4 py-2 text-center font-semibold">
                              {ms.gamesPlayed}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <UsageBar usage={ms.usageRate} />
                            </td>
                            <td className="px-4 py-2 text-center text-neutral-300">
                              {ms.avgRounds.toFixed(1)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {ms.overtimes > 0 ? (
                                <span className="text-amber-400 font-semibold">
                                  {ms.overtimes}
                                </span>
                              ) : (
                                <span className="text-neutral-500">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Closest Matches */}
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700">
                <h2 className="text-lg font-semibold">
                  Matchs les plus serrés
                </h2>
                <p className="text-xs text-neutral-400">
                  Différence de score minimale (matchs terminés)
                </p>
              </div>

              {stats.closestMatches.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  Aucun match terminé.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                  {stats.closestMatches.map((m) => (
                    <Link
                      key={m.id}
                      href={`/admin/matches/${m.id}`}
                      className="bg-neutral-900 border border-neutral-700 rounded-lg p-4 hover:border-neutral-500 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <TeamCell team={m.team1} compact />
                        <div className="text-center">
                          <span
                            className={`text-xl font-bold ${
                              m.winner_team_id === m.team1?.id
                                ? 'text-emerald-400'
                                : 'text-neutral-300'
                            }`}
                          >
                            {m.team1_score}
                          </span>
                          <span className="text-neutral-500 mx-2">-</span>
                          <span
                            className={`text-xl font-bold ${
                              m.winner_team_id === m.team2?.id
                                ? 'text-emerald-400'
                                : 'text-neutral-300'
                            }`}
                          >
                            {m.team2_score}
                          </span>
                        </div>
                        <TeamCell team={m.team2} compact />
                      </div>
                      <div className="text-xs text-neutral-500 text-center">
                        {m.stage_name || 'Stage inconnu'}
                        {m.round_number ? ` • Round ${m.round_number}` : ''}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type StatCardProps = {
  label: string;
  value: number;
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'neutral';
};

function StatCard({ label, value, color }: StatCardProps) {
  const colorClasses = {
    blue: 'border-blue-600/50 bg-blue-900/20',
    emerald: 'border-emerald-600/50 bg-emerald-900/20',
    amber: 'border-amber-600/50 bg-amber-900/20',
    red: 'border-red-600/50 bg-red-900/20',
    purple: 'border-purple-600/50 bg-purple-900/20',
    neutral: 'border-neutral-600/50 bg-neutral-800',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}

type TeamCellProps = {
  team: TeamMini | null;
  compact?: boolean;
};

function TeamCell({ team, compact }: TeamCellProps) {
  if (!team) {
    return <span className="text-neutral-500 text-sm">TBD</span>;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        {team.logo_url ? (
          <Image
            src={team.logo_url}
            alt={team.name}
            width={24}
            height={24}
            className="w-6 h-6 rounded object-cover border border-neutral-700 flex-shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded bg-neutral-700 border border-neutral-600 flex items-center justify-center text-[10px] font-semibold uppercase flex-shrink-0">
            {(team.short_name || team.name || '?').slice(0, 2)}
          </div>
        )}
        <span className="font-medium text-sm truncate">
          {team.short_name || team.name}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {team.logo_url ? (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={32}
          height={32}
          className="w-8 h-8 rounded object-cover border border-neutral-700"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-neutral-700 border border-neutral-600 flex items-center justify-center text-[11px] font-semibold uppercase">
          {(team.short_name || team.name || '?').slice(0, 2)}
        </div>
      )}
      <div>
        <div className="font-semibold">{team.name}</div>
        {team.short_name && (
          <div className="text-xs text-neutral-400">{team.short_name}</div>
        )}
      </div>
    </div>
  );
}

function WinrateBar({ winrate }: { winrate: number }) {
  const pct = Math.round(winrate * 100);
  const color =
    pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-neutral-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}

function UsageBar({ usage }: { usage: number }) {
  const pct = Math.round(usage * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-2 bg-neutral-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}

export default AdminTournamentStatsPage;
