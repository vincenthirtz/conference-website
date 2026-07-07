// pages/admin/tournament/[id]/analytics.tsx
//
// Feature: Analytics tournoi. Page en lecture seule qui consomme
// GET /api/admin/tournament/[id]/analytics (reducteur pur cote serveur).
//
// Sections :
//   - Resume : cartes KPI (matches, games, duree moy/game, % OT, % games decisifs).
//   - Equipes : classement (name, joues, V-D, winrate %, maps +/-).
//   - Maps : picks, bans, games joues, duree moy, % OT.
//   - Heros : picks, bans, V-D, winrate % (masquee si vide).
//
// Les fractions (winRate, overtimeRate, tiebreakerGameRate) sont formatees en %.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';
import type {
  TournamentAnalytics,
  TournamentAnalyticsHero,
  TournamentAnalyticsMap,
  TournamentAnalyticsTeam,
} from '@/utils/analytics/tournamentAnalytics';

type AnalyticsResponse = {
  tournament: { id: string; name: string; slug: string | null };
  analytics: TournamentAnalytics;
};

export const getServerSideProps = withStaffPage('manager');

/** Fraction 0..1 -> "xx %". */
function pct(fraction: number): string {
  return `${Math.round((fraction ?? 0) * 100)}%`;
}

function fmtMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  return `${min.toFixed(1)} min`;
}

function AdminTournamentAnalyticsPage(_props: StaffProps) {
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { id } = router.query;
  const t = useAdminT('adminTournamentAnalytics');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  async function fetchAnalytics() {
    if (!id || Array.isArray(id)) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<AnalyticsResponse>(
        `/api/admin/tournament/${id}/analytics`
      );
      setData(json);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const backUrl = `/admin/tournament/${id}/dashboard`;
  const analytics = data?.analytics ?? null;
  const isEmpty =
    !!analytics &&
    analytics.summary.totalMatches === 0 &&
    analytics.teams.length === 0 &&
    analytics.maps.length === 0 &&
    analytics.heroes.length === 0;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
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
              {t.back}
            </button>
            <h1 className="text-3xl font-bold">{t.heading}</h1>
            {data?.tournament && (
              <p className="text-neutral-400 text-sm mt-1">
                {t.tournamentLabel}
                <span className="font-semibold">{data.tournament.name}</span>
                {data.tournament.slug && (
                  <>
                    {' '}
                    <span className="font-mono bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded text-xs">
                      {data.tournament.slug}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? t.loading : t.refresh}
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {loading && !data && (
          <div className="text-neutral-400 text-sm">{t.loadingAnalytics}</div>
        )}

        {analytics && isEmpty && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-10 text-center text-sm text-neutral-400">
            {t.empty}
          </div>
        )}

        {analytics && !isEmpty && (
          <div className="space-y-6">
            {/* Resume */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <SummaryCard
                label={t.kpiMatchesPlayed}
                value={`${analytics.summary.finishedMatches}/${analytics.summary.totalMatches}`}
                color="emerald"
              />
              <SummaryCard
                label={t.kpiGamesPlayed}
                value={String(analytics.summary.totalGames)}
                color="purple"
              />
              <SummaryCard
                label={t.kpiAvgDuration}
                value={fmtMin(analytics.summary.avgGameDurationMin)}
                color="blue"
              />
              <SummaryCard
                label={t.kpiOvertime}
                value={pct(analytics.summary.overtimeRate)}
                color="amber"
              />
              <SummaryCard
                label={t.kpiDecisiveGames}
                value={pct(analytics.summary.tiebreakerGameRate)}
                color="neutral"
              />
              <SummaryCard
                label={t.kpiTotalMatches}
                value={String(analytics.summary.totalMatches)}
                color="neutral"
              />
            </div>

            {/* Equipes */}
            <TeamsTable teams={analytics.teams} />

            {/* Maps */}
            <MapsTable maps={analytics.maps} />

            {/* Heros (masquee si vide) */}
            {analytics.heroes.length > 0 && (
              <HeroesTable heroes={analytics.heroes} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* -----------------------------------------------------------
 * Sous-composants
 * ---------------------------------------------------------*/

type SummaryColor = 'blue' | 'emerald' | 'amber' | 'purple' | 'neutral';

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: SummaryColor;
}) {
  const colorClasses: Record<SummaryColor, string> = {
    blue: 'border-blue-600/50 bg-blue-900/20',
    emerald: 'border-emerald-600/50 bg-emerald-900/20',
    amber: 'border-amber-600/50 bg-amber-900/20',
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

function WinratePill({ fraction }: { fraction: number }) {
  const p = Math.round((fraction ?? 0) * 100);
  const color =
    p >= 70 ? 'bg-emerald-500' : p >= 50 ? 'bg-blue-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-16 h-2 bg-neutral-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right">{p}%</span>
    </div>
  );
}

function TableShell({
  title,
  subtitle,
  emptyLabel,
  isEmpty,
  children,
}: {
  title: string;
  subtitle: string;
  emptyLabel: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-700">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-neutral-400">{subtitle}</p>
      </div>
      {isEmpty ? (
        <div className="px-4 py-6 text-sm text-neutral-400">{emptyLabel}</div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

function TeamsTable({ teams }: { teams: TournamentAnalyticsTeam[] }) {
  const t = useAdminT('adminTournamentAnalytics');
  return (
    <TableShell
      title={t.teamsTitle}
      subtitle={t.teamsSubtitle}
      emptyLabel={t.teamsEmpty}
      isEmpty={teams.length === 0}
    >
      <table className="w-full text-sm">
        <thead className="bg-neutral-750 text-neutral-300">
          <tr>
            <th className="px-4 py-2 text-left">#</th>
            <th className="px-4 py-2 text-left">{t.colTeam}</th>
            <th className="px-4 py-2 text-center">{t.colPlayed}</th>
            <th className="px-4 py-2 text-center">{t.colWins}</th>
            <th className="px-4 py-2 text-center">{t.colLosses}</th>
            <th className="px-4 py-2 text-center">{t.colWinrate}</th>
            <th className="px-4 py-2 text-center">{t.colMaps}</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, idx) => {
            const diff = team.mapWins - team.mapLosses;
            return (
              <tr key={team.teamId} className="border-t border-neutral-700">
                <td className="px-4 py-2 text-neutral-400 font-mono">
                  {idx + 1}
                </td>
                <td className="px-4 py-2 font-medium">{team.name}</td>
                <td className="px-4 py-2 text-center text-neutral-300">
                  {team.played}
                </td>
                <td className="px-4 py-2 text-center text-emerald-400 font-semibold">
                  {team.wins}
                </td>
                <td className="px-4 py-2 text-center text-red-400 font-semibold">
                  {team.losses}
                </td>
                <td className="px-4 py-2 text-center">
                  <WinratePill fraction={team.winRate} />
                </td>
                <td className="px-4 py-2 text-center text-xs">
                  <span
                    className={
                      diff > 0
                        ? 'text-emerald-400'
                        : diff < 0
                          ? 'text-red-400'
                          : 'text-neutral-300'
                    }
                  >
                    {team.mapWins}-{team.mapLosses} ({diff > 0 ? '+' : ''}
                    {diff})
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}

function MapsTable({ maps }: { maps: TournamentAnalyticsMap[] }) {
  const t = useAdminT('adminTournamentAnalytics');
  return (
    <TableShell
      title={t.mapsTitle}
      subtitle={t.mapsSubtitle}
      emptyLabel={t.mapsEmpty}
      isEmpty={maps.length === 0}
    >
      <table className="w-full text-sm">
        <thead className="bg-neutral-750 text-neutral-300">
          <tr>
            <th className="px-4 py-2 text-left">{t.colMap}</th>
            <th className="px-4 py-2 text-center">{t.colPicks}</th>
            <th className="px-4 py-2 text-center">{t.colBans}</th>
            <th className="px-4 py-2 text-center">{t.colGames}</th>
            <th className="px-4 py-2 text-center">{t.colAvgDuration}</th>
            <th className="px-4 py-2 text-center">{t.colOvertime}</th>
          </tr>
        </thead>
        <tbody>
          {maps.map((m) => (
            <tr key={m.mapName} className="border-t border-neutral-700">
              <td className="px-4 py-2 font-medium">{m.mapName}</td>
              <td className="px-4 py-2 text-center">{m.picks}</td>
              <td className="px-4 py-2 text-center text-neutral-300">
                {m.bans}
              </td>
              <td className="px-4 py-2 text-center font-semibold">
                {m.gamesPlayed}
              </td>
              <td className="px-4 py-2 text-center text-neutral-300">
                {fmtMin(m.avgDurationMin)}
              </td>
              <td className="px-4 py-2 text-center">
                {m.overtimeRate > 0 ? (
                  <span className="text-amber-400 font-semibold">
                    {pct(m.overtimeRate)}
                  </span>
                ) : (
                  <span className="text-neutral-500">0%</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function HeroesTable({ heroes }: { heroes: TournamentAnalyticsHero[] }) {
  const t = useAdminT('adminTournamentAnalytics');
  return (
    <TableShell
      title={t.heroesTitle}
      subtitle={t.heroesSubtitle}
      emptyLabel={t.heroesEmpty}
      isEmpty={heroes.length === 0}
    >
      <table className="w-full text-sm">
        <thead className="bg-neutral-750 text-neutral-300">
          <tr>
            <th className="px-4 py-2 text-left">{t.colHero}</th>
            <th className="px-4 py-2 text-center">{t.colPicks}</th>
            <th className="px-4 py-2 text-center">{t.colBans}</th>
            <th className="px-4 py-2 text-center">{t.colWins}</th>
            <th className="px-4 py-2 text-center">{t.colLosses}</th>
            <th className="px-4 py-2 text-center">{t.colWinrate}</th>
          </tr>
        </thead>
        <tbody>
          {heroes.map((h) => (
            <tr key={h.heroId} className="border-t border-neutral-700">
              <td className="px-4 py-2 font-medium">{h.name}</td>
              <td className="px-4 py-2 text-center font-semibold">{h.picks}</td>
              <td className="px-4 py-2 text-center text-neutral-300">
                {h.bans}
              </td>
              <td className="px-4 py-2 text-center text-emerald-400 font-semibold">
                {h.wins}
              </td>
              <td className="px-4 py-2 text-center text-red-400 font-semibold">
                {h.losses}
              </td>
              <td className="px-4 py-2 text-center">
                <WinratePill fraction={h.winRate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

export default AdminTournamentAnalyticsPage;
