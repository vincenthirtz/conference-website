// components/admin/tournament/StatsAnalyticsPanel.tsx
//
// Feature: Analytics tournoi. Read-only panel that consumes
// GET /api/admin/tournament/[id]/analytics (pure reducer server-side).
// Extracted from the former /admin/tournament/[id]/analytics page; now the
// `analytics` sub-tab of the merged stats route.
//
// Sections :
//   - Resume : cartes KPI (matches, games, duree moy/game, % OT, % games decisifs).
//   - Equipes : classement (name, joues, V-D, winrate %, maps +/-).
//   - Maps : picks, bans, games joues, duree moy, % OT.
//   - Heros : picks, bans, V-D, winrate % (masquee si vide).
//   - Bans de heros / bans par equipe : saisie par partie (games.hero_bans),
//     la seule source de la Cup 2026 (ni veto ni draft).
//
// Un indicateur jamais saisi (duree, prolongations, manches decisives) est
// MASQUE plutot qu'affiche a « — » ou « 0 % » : un 0 % non saisi se lit comme
// un vrai 0 %.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type {
  HeroCount,
  TournamentAnalytics,
  TournamentAnalyticsHero,
  TournamentAnalyticsHeroBan,
  TournamentAnalyticsMap,
  TournamentAnalyticsTeam,
  TournamentAnalyticsTeamBans,
} from '@/utils/analytics/tournamentAnalytics';
import nsAdminTournamentAnalytics from '@/lib/i18n/locales/admin-fr/adminTournamentAnalytics';
import TierListPanel from './TierListPanel';
import type { TeamDuel, TierList } from '@/utils/analytics/teamTiers';

type AnalyticsResponse = {
  tournament: { id: string; name: string; slug: string | null };
  analytics: TournamentAnalytics;
  /** Tier list et duels : mêmes lignes, deux lectures de plus (cf. l'API). */
  tiers?: TierList;
  duels?: TeamDuel[];
};

/** Fraction 0..1 -> "xx %". */
function pct(fraction: number): string {
  return `${Math.round((fraction ?? 0) * 100)}%`;
}

function fmtMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  return `${min.toFixed(1)} min`;
}

export default function StatsAnalyticsPanel() {
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { id } = router.query;
  const t = useAdminT(nsAdminTournamentAnalytics);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  const fetchAnalytics = useCallback(async () => {
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
  }, [id, adminFetchJson, t]);

  useEffect(() => {
    if (!id) return;
    fetchAnalytics();
  }, [id, fetchAnalytics]);

  const analytics = data?.analytics ?? null;
  const isEmpty =
    !!analytics &&
    analytics.summary.totalMatches === 0 &&
    analytics.teams.length === 0 &&
    analytics.maps.length === 0 &&
    analytics.heroes.length === 0 &&
    analytics.heroBans.length === 0;

  const summary = analytics?.summary;
  const hasDuration = !!summary && summary.gamesWithDuration > 0;
  const hasOvertime = !!summary && summary.overtimeRate > 0;
  const hasTiebreaker = !!summary && summary.tiebreakerGameRate > 0;
  const notRecorded = [
    !hasDuration && t.notRecordedDuration,
    !hasOvertime && t.notRecordedOvertime,
    !hasTiebreaker && t.notRecordedTiebreaker,
  ].filter((v): v is string => Boolean(v));

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
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

      {analytics && summary && !isEmpty && (
        <div className="space-y-6">
          {/* Resume */}
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <SummaryCard
                label={t.kpiMatchesPlayed}
                value={`${summary.finishedMatches}/${summary.totalMatches}`}
                color="emerald"
              />
              <SummaryCard
                label={t.kpiGamesPlayed}
                value={String(summary.totalGames)}
                color="purple"
              />
              {summary.pickedMaps > 0 && (
                <SummaryCard
                  label={t.kpiPickedMaps}
                  value={String(summary.pickedMaps)}
                  color="blue"
                />
              )}
              {summary.pickDecided > 0 && (
                <SummaryCard
                  label={t.kpiPickerWinRate}
                  value={pct(summary.pickerWinRate)}
                  hint={format(t.kpiPickerWinRateHint, {
                    wins: analytics.maps.reduce((a, m) => a + m.pickerWins, 0),
                    total: summary.pickDecided,
                  })}
                  color="blue"
                />
              )}
              {summary.totalHeroBans > 0 && (
                <SummaryCard
                  label={t.kpiHeroBans}
                  value={String(summary.totalHeroBans)}
                  hint={format(t.kpiHeroBansHint, {
                    maps: summary.mapsWithHeroBans,
                  })}
                  color="amber"
                />
              )}
              {hasDuration && (
                <SummaryCard
                  label={t.kpiAvgDuration}
                  value={fmtMin(summary.avgGameDurationMin)}
                  color="blue"
                />
              )}
              {hasOvertime && (
                <SummaryCard
                  label={t.kpiOvertime}
                  value={pct(summary.overtimeRate)}
                  color="amber"
                />
              )}
              {hasTiebreaker && (
                <SummaryCard
                  label={t.kpiDecisiveGames}
                  value={pct(summary.tiebreakerGameRate)}
                  color="neutral"
                />
              )}
            </div>
            {notRecorded.length > 0 && summary.totalGames > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                {format(t.notRecorded, { fields: notRecorded.join(', ') })}
              </p>
            )}
          </div>

          {/* Equipes */}
          <TeamsTable teams={analytics.teams} />

          {/* Maps */}
          <MapsTable
            maps={analytics.maps}
            showDuration={hasDuration}
            showOvertime={hasOvertime}
          />

          {/* Bans de heros saisis par partie (masques si aucun) */}
          {analytics.heroBans.length > 0 && (
            <HeroBansTable
              heroBans={analytics.heroBans}
              totalBans={summary.totalHeroBans}
              maps={summary.mapsWithHeroBans}
            />
          )}
          {analytics.teamBans.length > 0 && (
            <TeamBansTable teamBans={analytics.teamBans} />
          )}

          {/* Heros (masquee si vide) */}
          {analytics.heroes.length > 0 && (
            <HeroesTable heroes={analytics.heroes} />
          )}

          {/* Tier list + comparateur : outils de préparation, staff seulement. */}
          {data?.tiers && (
            <TierListPanel
              tiers={data.tiers}
              duels={data.duels ?? []}
              teams={analytics.teams}
            />
          )}
        </div>
      )}
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
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
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
      {hint && (
        <div className="text-[11px] text-neutral-500 mt-0.5">{hint}</div>
      )}
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
  const t = useAdminT(nsAdminTournamentAnalytics);
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
            <th scope="col" className="px-4 py-2 text-left">
              #
            </th>
            <th scope="col" className="px-4 py-2 text-left">
              {t.colTeam}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colPlayed}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colWins}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colLosses}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colWinrate}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colMaps}
            </th>
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

function MapsTable({
  maps,
  showDuration,
  showOvertime,
}: {
  maps: TournamentAnalyticsMap[];
  showDuration: boolean;
  showOvertime: boolean;
}) {
  const t = useAdminT(nsAdminTournamentAnalytics);
  // Colonnes masquees quand aucune ligne n'a de donnee : une colonne de zeros
  // ou de tirets n'apprend rien.
  const showBans = maps.some((m) => m.bans > 0);
  const showPickerWins = maps.some((m) => m.pickDecided > 0);
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
            <th scope="col" className="px-4 py-2 text-left">
              {t.colMap}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colGames}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colPicks}
            </th>
            {showPickerWins && (
              <th scope="col" className="px-4 py-2 text-center">
                {t.colPickerWins}
              </th>
            )}
            {showBans && (
              <th scope="col" className="px-4 py-2 text-center">
                {t.colBans}
              </th>
            )}
            {showDuration && (
              <th scope="col" className="px-4 py-2 text-center">
                {t.colAvgDuration}
              </th>
            )}
            {showOvertime && (
              <th scope="col" className="px-4 py-2 text-center">
                {t.colOvertime}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {maps.map((m) => (
            <tr key={m.mapName} className="border-t border-neutral-700">
              <td className="px-4 py-2 font-medium">{m.mapName}</td>
              <td className="px-4 py-2 text-center font-semibold">
                {m.gamesPlayed}
              </td>
              <td className="px-4 py-2 text-center">
                {m.picks > 0 ? (
                  m.picks
                ) : (
                  <span className="text-neutral-500">0</span>
                )}
              </td>
              {showPickerWins && (
                <td className="px-4 py-2 text-center">
                  {m.pickDecided > 0 ? (
                    <span className="text-xs">
                      {m.pickerWins}/{m.pickDecided}
                      <span className="text-neutral-400">
                        {' '}
                        ({pct(m.pickerWinRate)})
                      </span>
                    </span>
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </td>
              )}
              {showBans && (
                <td className="px-4 py-2 text-center text-neutral-300">
                  {m.bans}
                </td>
              )}
              {showDuration && (
                <td className="px-4 py-2 text-center text-neutral-300">
                  {fmtMin(m.avgDurationMin)}
                </td>
              )}
              {showOvertime && (
                <td className="px-4 py-2 text-center">
                  {m.overtimeRate > 0 ? (
                    <span className="text-amber-400 font-semibold">
                      {pct(m.overtimeRate)}
                    </span>
                  ) : (
                    <span className="text-neutral-500">0%</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

const ROLE_STYLE: Record<string, string> = {
  tank: 'bg-sky-900/50 text-sky-300 border-sky-700/60',
  damage: 'bg-red-900/40 text-red-300 border-red-700/60',
  support: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60',
};

function RoleBadge({ role }: { role: string | null }) {
  const t = useAdminT(nsAdminTournamentAnalytics);
  if (!role) return <span className="text-neutral-500">—</span>;
  const label =
    role === 'tank'
      ? t.roleTank
      : role === 'damage'
        ? t.roleDamage
        : role === 'support'
          ? t.roleSupport
          : role;
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${
        ROLE_STYLE[role] ?? 'bg-neutral-700 text-neutral-300 border-neutral-600'
      }`}
    >
      {label}
    </span>
  );
}

/** Barre horizontale proportionnelle (part 0..1) + libelle. */
function RateBar({ fraction }: { fraction: number }) {
  const p = Math.round((fraction ?? 0) * 100);
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-20 h-2 bg-neutral-700 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500" style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{p}%</span>
    </div>
  );
}

/** Liste compacte « Héros ×n » ; au-dela de `max`, un « +k » en fin. */
function HeroChips({ items, max = 4 }: { items: HeroCount[]; max?: number }) {
  if (items.length === 0) return <span className="text-neutral-500">—</span>;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((h) => (
        <span
          key={h.hero}
          className="rounded bg-neutral-700/70 px-1.5 py-0.5 text-xs whitespace-nowrap"
        >
          {h.name}
          {h.count > 1 && <span className="text-neutral-400"> ×{h.count}</span>}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="px-1 py-0.5 text-xs text-neutral-400"
          title={items
            .slice(max)
            .map((h) => `${h.name} ×${h.count}`)
            .join(', ')}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

function HeroBansTable({
  heroBans,
  totalBans,
  maps,
}: {
  heroBans: TournamentAnalyticsHeroBan[];
  totalBans: number;
  maps: number;
}) {
  const t = useAdminT(nsAdminTournamentAnalytics);
  return (
    <TableShell
      title={t.heroBansTitle}
      subtitle={format(t.heroBansSubtitle, { bans: totalBans, maps })}
      emptyLabel={t.heroesEmpty}
      isEmpty={heroBans.length === 0}
    >
      <table className="w-full text-sm">
        <thead className="bg-neutral-750 text-neutral-300">
          <tr>
            <th scope="col" className="px-4 py-2 text-left">
              {t.colHero}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colRole}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colBans}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colBanRate}
            </th>
            <th scope="col" className="px-4 py-2 text-left">
              {t.colBannedBy}
            </th>
          </tr>
        </thead>
        <tbody>
          {heroBans.map((h) => (
            <tr key={h.hero} className="border-t border-neutral-700">
              <td className="px-4 py-2 font-medium">{h.name}</td>
              <td className="px-4 py-2 text-center">
                <RoleBadge role={h.role} />
              </td>
              <td className="px-4 py-2 text-center font-semibold">{h.bans}</td>
              <td className="px-4 py-2 text-center">
                <RateBar fraction={h.rate} />
              </td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {h.byTeam.map((b) => (
                    <span
                      key={b.teamId}
                      className="rounded bg-neutral-700/70 px-1.5 py-0.5 text-xs whitespace-nowrap"
                    >
                      {b.name}
                      {b.count > 1 && (
                        <span className="text-neutral-400"> ×{b.count}</span>
                      )}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function TeamBansTable({
  teamBans,
}: {
  teamBans: TournamentAnalyticsTeamBans[];
}) {
  const t = useAdminT(nsAdminTournamentAnalytics);
  return (
    <TableShell
      title={t.teamBansTitle}
      subtitle={t.teamBansSubtitle}
      emptyLabel={t.teamsEmpty}
      isEmpty={teamBans.length === 0}
    >
      <table className="w-full text-sm">
        <thead className="bg-neutral-750 text-neutral-300">
          <tr>
            <th scope="col" className="px-4 py-2 text-left">
              {t.colTeam}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colMaps}
            </th>
            <th scope="col" className="px-4 py-2 text-left">
              {t.colBansMade}
            </th>
            <th scope="col" className="px-4 py-2 text-left">
              {t.colBansReceived}
            </th>
          </tr>
        </thead>
        <tbody>
          {teamBans.map((tb) => (
            <tr key={tb.teamId} className="border-t border-neutral-700">
              <td className="px-4 py-2 font-medium">{tb.name}</td>
              <td className="px-4 py-2 text-center text-neutral-300">
                {tb.maps}
              </td>
              <td className="px-4 py-2">
                <HeroChips items={tb.made} />
              </td>
              <td className="px-4 py-2">
                <HeroChips items={tb.received} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function HeroesTable({ heroes }: { heroes: TournamentAnalyticsHero[] }) {
  const t = useAdminT(nsAdminTournamentAnalytics);
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
            <th scope="col" className="px-4 py-2 text-left">
              {t.colHero}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colPicks}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colBans}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colWins}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colLosses}
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              {t.colWinrate}
            </th>
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
