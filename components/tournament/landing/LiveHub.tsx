/* biome-ignore-all lint/performance/noImgElement: logos d'équipe hors next/image, comme TeamRoster */
// components/tournament/landing/LiveHub.tsx
//
// « Où en est le tournoi » : avancement, matchs en direct, prochains matchs,
// derniers résultats et classement officiel — en tête de la landing dès que le
// tournoi a des matchs. Le reste de la page (format, récompenses, FAQ) parle à
// qui découvre le tournoi ; ce bloc parle à qui le SUIT.
//
// Le classement est celui de la page Classement (readPublicStandings), pas un
// tri refait ici : deux pages qui classent différemment, c'est une question
// posée sur Discord à chaque journée.

import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { Section, SectionHeader, GlassCard, Spotlight } from './primitives';
import { COMMUNITY_LINKS } from './types';
import type {
  HubMatch,
  HubTeam,
  LiveHub as LiveHubData,
} from '@/utils/tournament/liveHub';
import type { PublicStandingsTable } from '@/utils/stages/publicStandings';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

const TZ = 'Europe/Paris';

type Dict = typeof nsTournamentLanding.fr;

function formatWhen(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Fuseau explicite : rendu serveur et client identiques (pas d'écart
  // d'hydratation), et l'heure de Paris est celle que le staff annonce.
  return d.toLocaleString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function TeamLogo({
  team,
  size = 28,
}: {
  team: HubTeam | null;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (team?.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt=""
        style={style}
        className="shrink-0 rounded-lg border border-white/10 bg-black/40 object-contain"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      style={style}
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300"
    >
      {team ? initials(team.name) : '?'}
    </span>
  );
}

function teamLabel(team: HubTeam | null, t: Dict): string {
  return team?.name ?? t.hubTbd;
}

/** Une ligne de match : équipes, horaire ou score, lien vers la fiche. */
function MatchRow({
  match,
  mode,
  locale,
  t,
}: {
  match: HubMatch;
  mode: 'live' | 'upcoming' | 'result';
  locale: string;
  t: Dict;
}) {
  const when = formatWhen(match.scheduled_at, locale);
  const w = match.winner_team_id;
  const isForfeit = match.status === 'walkover';
  const side = (team: HubTeam | null) =>
    mode === 'result' && w && team
      ? team.id === w
        ? 'text-white font-semibold'
        : 'text-gray-400'
      : 'text-gray-100';

  const meta = [match.round_name, match.match_format?.toUpperCase()]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <Link
        href={`/match/${match.id}`}
        aria-label={format(t.hubMatchAria, {
          team1: teamLabel(match.team1, t),
          team2: teamLabel(match.team2, t),
          date: when,
        })}
        className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-[var(--color-violet)]/50 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <TeamLogo team={match.team1} size={22} />
            <span className={`truncate text-sm ${side(match.team1)}`}>
              {teamLabel(match.team1, t)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TeamLogo team={match.team2} size={22} />
            <span className={`truncate text-sm ${side(match.team2)}`}>
              {teamLabel(match.team2, t)}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {mode === 'result' ? (
            isForfeit ? (
              <span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[11px] font-semibold text-purple-200">
                {t.hubForfeit}
              </span>
            ) : (
              <div className="flex flex-col items-end font-mono text-base font-bold tabular-nums leading-[1.35]">
                <span className={side(match.team1)}>
                  {match.team1_score ?? 0}
                </span>
                <span className={side(match.team2)}>
                  {match.team2_score ?? 0}
                </span>
              </div>
            )
          ) : mode === 'live' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
              <span className="tl-live-dot h-1.5 w-1.5 rounded-full bg-red-400" />
              {t.hubLive}
            </span>
          ) : (
            <span className="text-xs font-medium capitalize text-gray-200">
              {when}
            </span>
          )}
          {meta && (
            <div className="mt-1 text-[10px] uppercase tracking-wider text-gray-500">
              {meta}
            </div>
          )}
          {mode === 'result' && when && (
            <div className="text-[10px] capitalize text-gray-500">{when}</div>
          )}
        </div>
      </Link>
    </li>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-200">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </GlassCard>
  );
}

function PanelLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="shrink-0 text-xs font-semibold text-[var(--color-violet-light)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] rounded"
    >
      {children} →
    </Link>
  );
}

function StandingsMini({ table, t }: { table: PublicStandingsTable; t: Dict }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-gray-500">
          <th scope="col" className="w-7 pb-2 text-left font-medium">
            #
          </th>
          <th scope="col" className="pb-2 text-left font-medium">
            {t.hubColTeam}
          </th>
          <th scope="col" className="pb-2 text-center font-medium">
            {t.hubColRecord}
          </th>
          <th
            scope="col"
            className="hidden pb-2 text-center font-medium sm:table-cell"
          >
            {t.hubColMaps}
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            {t.hubColPoints}
          </th>
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => {
          const diff = row.mapsWon - row.mapsLost;
          const team: HubTeam = {
            id: row.teamId,
            slug: row.slug,
            name: row.teamName,
            short_name: row.shortName,
            logo_url: row.logoUrl,
          };
          return (
            <tr key={row.teamId} className="border-t border-white/5">
              <td className="py-2 font-mono text-xs text-gray-400">
                {row.rank}
              </td>
              <td className="py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamLogo team={team} size={20} />
                  {row.slug ? (
                    <Link
                      href={`/team/${row.slug}`}
                      className="truncate text-gray-100 hover:text-white hover:underline"
                    >
                      {row.teamName}
                    </Link>
                  ) : (
                    <span className="truncate text-gray-100">
                      {row.teamName}
                    </span>
                  )}
                </span>
              </td>
              <td className="py-2 text-center font-mono text-xs text-gray-300">
                {row.wins}–{row.losses}
              </td>
              <td
                className={`hidden py-2 text-center font-mono text-xs sm:table-cell ${
                  diff > 0
                    ? 'text-emerald-400'
                    : diff < 0
                      ? 'text-red-400'
                      : 'text-gray-400'
                }`}
              >
                {diff > 0 ? `+${diff}` : diff}
              </td>
              <td className="py-2 text-right font-mono font-bold tabular-nums text-white">
                {row.points}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function LiveHub({
  hub,
  standings,
  tournamentPath,
}: {
  hub: LiveHubData;
  standings: PublicStandingsTable[];
  tournamentPath: string;
}) {
  const t = useT(nsTournamentLanding);
  const locale = useLocale();
  if (hub.total === 0) return null;

  const progress =
    hub.total > 0 ? Math.round((hub.played / hub.total) * 100) : 0;
  const hasStandings = standings.some((tb) => tb.rows.length > 0);
  const hasPlayed = standings.some((tb) => tb.rows.some((r) => r.played > 0));
  const showStageNames = standings.length > 1;
  const upcoming = [...hub.live, ...hub.upcoming];

  return (
    <Section id="suivi">
      <Spotlight
        color="green"
        className="right-[-10%] top-0 h-[360px] w-[520px] opacity-50"
      />
      <SectionHeader
        eyebrow={t.hubEyebrow}
        title={t.hubTitle}
        align="left"
        subtitle={[
          format(t.hubProgress, { played: hub.played, total: hub.total }),
          hub.nextRound
            ? format(t.hubNextRound, { round: hub.nextRound })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <div
        className="-mt-6 mb-8 h-1.5 w-full overflow-hidden rounded-full bg-white/10 md:-mt-10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={hub.total}
        aria-valuenow={hub.played}
        aria-label={format(t.hubProgress, {
          played: hub.played,
          total: hub.total,
        })}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Panel
            title={hub.live.length > 0 ? t.hubLive : t.hubUpcoming}
            action={
              hub.live.length > 0 ? (
                <a
                  href={hub.live[0].stream_url || COMMUNITY_LINKS.twitch}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-violet-cta)] px-3 py-1 text-xs font-bold text-white hover:brightness-110"
                >
                  {t.hubWatch}
                </a>
              ) : (
                <PanelLink href={`${tournamentPath}/matches`}>
                  {t.hubSeeAllMatches}
                </PanelLink>
              )
            }
          >
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400">{t.hubUpcomingEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    mode={m.status === 'ongoing' ? 'live' : 'upcoming'}
                    locale={locale}
                    t={t}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={t.hubRecent}
            action={
              hub.recent.length > 0 ? (
                <PanelLink href={`${tournamentPath}/matches`}>
                  {t.hubSeeAllMatches}
                </PanelLink>
              ) : undefined
            }
          >
            {hub.recent.length === 0 ? (
              <p className="text-sm text-gray-400">{t.hubRecentEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {hub.recent.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    mode="result"
                    locale={locale}
                    t={t}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title={t.hubStandings}
          action={
            hasStandings ? (
              <PanelLink href={`${tournamentPath}/standings`}>
                {t.hubSeeStandings}
              </PanelLink>
            ) : undefined
          }
        >
          {!hasStandings || !hasPlayed ? (
            <p className="text-sm text-gray-400">{t.hubStandingsEmpty}</p>
          ) : (
            <div className="space-y-5">
              {standings
                .filter((tb) => tb.rows.length > 0)
                .map((tb) => (
                  <div key={tb.key}>
                    {(showStageNames || tb.groupKey) && (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        {[showStageNames ? tb.stageName : null, tb.groupKey]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    <StandingsMini table={tb} t={t} />
                  </div>
                ))}
            </div>
          )}
        </Panel>
      </div>
    </Section>
  );
}
