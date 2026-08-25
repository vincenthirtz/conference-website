// pages/match/[id].tsx

import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { maskBattleTag } from '@/utils/battleTag';
import { splitTeamMembers, isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import {
  resolveMissingDisplayNames,
  withFallbackDisplayName,
} from '@/utils/teams/memberDisplayName';
import type { MatchStatus, BracketSide } from '@/types/admin';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

import { logger } from '../../utils/logger';
import nsMatchDetail from '@/lib/i18n/locales/fr/matchDetail';

type MatchDict = typeof nsMatchDetail.fr;
type SimpleTeam = {
  id: string;
  slug?: string | null;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  captain_id?: string | null;
};

// Une ligne de composition, telle qu'affichée publiquement. `battle_tag` est
// masqué (maskBattleTag) — le discriminant numérique n'a rien à faire sur une
// page indexable. `user_id` conditionne le lien vers le profil public.
type LineupMember = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  battle_tag: string | null;
  role: string | null;
  is_substitute: boolean;
  is_captain: boolean;
};

type MatchLineups = {
  team1: LineupMember[];
  team2: LineupMember[];
};

// MVP du match : `memberId` pointe une ligne `team_members` (donc une entrée de
// la composition), `battleTag` est le snapshot pris à l'import — il survit à la
// suppression du membre.
type MatchMvp = {
  memberId: string | null;
  battleTag: string | null;
};

type Tournament = {
  id: string;
  slug?: string | null;
  name: string;
  short_name?: string | null;
  game?: string | null;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string;
};

type Game = {
  id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type Match = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  match_format: string | null;
  round_name: string | null;
  round_number: number | null;
  bracket_side: BracketSide;
  group_key: string | null;
  team1_score: number | null;
  team2_score: number | null;
  scheduled_at: string | null;
  completed_at: string | null;
  stream_url: string | null;
  replay_url: string | null;
  lobby_code: string | null;
  notes: string | null;
  team1: SimpleTeam | null;
  team2: SimpleTeam | null;
  tournament: Tournament;
  stage: Stage | null;
  games: Game[];
};

type Props = {
  match: Match | null;
  lineups: MatchLineups;
  mvp: MatchMvp | null;
  seo: SeoProps;
};

const SEO_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://owwomenscup.fr';

/** Libellé public d'une joueuse : pseudo de compte, sinon BattleTag masqué. */
function lineupLabel(member: LineupMember): string | null {
  // L'encadrement (coach / manager) n'a pas de BattleTag : on inverse la
  // priorité pour ces rôles, comme sur la fiche d'équipe.
  return isNonPlayingTeamRole(member.role)
    ? member.display_name || member.battle_tag
    : member.battle_tag || member.display_name;
}

/** Retrouve la MVP dans les compositions (elle peut avoir quitté l'équipe). */
function findMvpMember(
  lineups: MatchLineups,
  mvp: MatchMvp | null
): LineupMember | null {
  if (!mvp?.memberId) return null;
  return (
    [...lineups.team1, ...lineups.team2].find((m) => m.id === mvp.memberId) ??
    null
  );
}

// SEO par-entité pour un match : titre lisible « T1 vs T2 – Tournoi » (les noms
// d'équipe ne se traduisent pas, d'où un `string` simple), description bilingue
// et un JSON-LD `SportsEvent` (un match = un évènement sportif daté), inspiré du
// modèle de la page tournoi. Retourné via `props.seo`.
function buildMatchSeo(
  match: Match,
  lineups: MatchLineups,
  mvp: MatchMvp | null
): SeoProps {
  const t1 = match.team1?.short_name || match.team1?.name || 'TBD';
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? 'BYE' : 'TBD');
  const versus = `${t1} vs ${t2}`;
  const tournamentName = match.tournament.name;
  const game = match.tournament.game || 'Overwatch';
  const matchUrl = `${SEO_BASE_URL}/match/${match.id}`;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: versus,
    url: matchUrl,
    ...(match.scheduled_at ? { startDate: match.scheduled_at } : {}),
    eventStatus:
      match.status === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: matchUrl,
    },
    organizer: {
      '@type': 'Organization',
      name: "OW Women's Cup",
      url: SEO_BASE_URL,
    },
    sport: game,
    inLanguage: 'fr-FR',
  };

  // Les joueuses sont nommées dans le JSON-LD (`competitor.athlete`) : un match
  // n'est pas qu'une confrontation de logos, et c'est le seul endroit où les
  // moteurs peuvent relier une joueuse à l'évènement qu'elle a joué. Chaque
  // athlète pointe vers son profil public quand elle a un compte.
  const competitors = [
    { team: match.team1, members: lineups.team1 },
    { team: match.team2, members: lineups.team2 },
  ]
    .filter((c) => c.team)
    .map((c) => {
      const athletes = c.members
        .filter((m) => !isNonPlayingTeamRole(m.role))
        .map((m) => ({ member: m, name: lineupLabel(m) }))
        .filter((a) => Boolean(a.name))
        .map((a) => ({
          '@type': 'Person',
          name: a.name,
          ...(a.member.user_id
            ? {
                url: `${SEO_BASE_URL}/player/${encodeURIComponent(a.member.user_id)}`,
              }
            : {}),
        }));
      return {
        '@type': 'SportsTeam',
        name: c.team!.name,
        ...(athletes.length > 0 ? { athlete: athletes } : {}),
      };
    });
  if (competitors.length > 0) jsonLd.competitor = competitors;

  const mvpMember = findMvpMember(lineups, mvp);
  const mvpName = mvpMember ? lineupLabel(mvpMember) : (mvp?.battleTag ?? null);
  if (mvpName) {
    jsonLd.performer = {
      '@type': 'Person',
      name: mvpName,
      ...(mvpMember?.user_id
        ? {
            url: `${SEO_BASE_URL}/player/${encodeURIComponent(mvpMember.user_id)}`,
          }
        : {}),
    };
  }

  return {
    title: `${versus} – ${tournamentName}`,
    description: {
      fr: `Suivez ${versus} au tournoi ${tournamentName} — OW Women's Cup : score global, détail des maps et informations du match.`,
      en: `Follow ${versus} at the ${tournamentName} tournament — OW Women's Cup: overall score, map breakdown and match details.`,
    },
    type: 'website',
    jsonLd,
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) {
    return { notFound: true, revalidate: 60 };
  }

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      stage_id,
      status,
      is_bye,
      match_format,
      round_name,
      round_number,
      bracket_side,
      group_key,
      team1_score,
      team2_score,
      scheduled_at,
      completed_at,
      stream_url,
      replay_url,
      lobby_code,
      notes,
      team1:team1_id ( id, slug, name, short_name, logo_url, captain_id ),
      team2:team2_id ( id, slug, name, short_name, logo_url, captain_id ),
      tournament:tournament_id ( id, slug, name, short_name, game ),
      stage:stage_id ( id, name, stage_type ),
      games (*)
    `
    )
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();

  if (error || !data) {
    logger.error('match page error:', error);
    return { notFound: true, revalidate: 60 };
  }

  const match = data as any as Match;

  // Tri des games par ordre
  match.games =
    match.games?.slice().sort((a: Game, b: Game) => {
      const oa = a.map_order ?? 0;
      const ob = b.map_order ?? 0;
      return oa - ob;
    }) ?? [];

  const [lineups, mvp] = await Promise.all([
    readMatchLineups(match),
    readMatchMvp(match.id),
  ]);

  return {
    props: {
      match,
      lineups,
      mvp,
      seo: buildMatchSeo(match, lineups, mvp),
    },
    revalidate: 30,
  };
};

/**
 * Compositions des deux équipes.
 *
 * Best-effort : une erreur de lecture renvoie des listes vides plutôt que de
 * faire tomber la page — le score et les maps restent la valeur principale.
 * Le pseudo suit le même repli que partout ailleurs (surcharge d'équipe →
 * pseudo de compte), et le BattleTag est masqué.
 */
async function readMatchLineups(match: Match): Promise<MatchLineups> {
  const teamIds = [match.team1?.id, match.team2?.id].filter(
    (id): id is string => Boolean(id)
  );
  if (teamIds.length === 0) return { team1: [], team2: [] };

  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select(
      'id, team_id, user_id, display_name, battle_tag, role, is_substitute'
    )
    .in('team_id', teamIds)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('match lineups error:', error);
    return { team1: [], team2: [] };
  }

  const rows = (data || []) as any[];
  const resolved = await resolveMissingDisplayNames(rows);

  const toLineup = (team: SimpleTeam | null): LineupMember[] => {
    if (!team) return [];
    return rows
      .filter((m) => m.team_id === team.id)
      .map((m) => ({
        id: m.id,
        user_id: m.user_id ?? null,
        display_name: withFallbackDisplayName(m, resolved),
        battle_tag: maskBattleTag(m.battle_tag ?? null),
        role: m.role ?? null,
        is_substitute: Boolean(m.is_substitute),
        is_captain: Boolean(team.captain_id && m.user_id === team.captain_id),
      }));
  };

  return { team1: toLineup(match.team1), team2: toLineup(match.team2) };
}

/** MVP du match, si le staff a importé le résultat du sondage Discord. */
async function readMatchMvp(matchId: string): Promise<MatchMvp | null> {
  const { data, error } = await supabaseAdmin
    .from('match_mvp_polls')
    .select('winner_member_id, winner_battle_tag')
    .eq('match_id', matchId)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.winner_member_id && !data.winner_battle_tag) return null;
  return {
    memberId: data.winner_member_id ?? null,
    battleTag: maskBattleTag(data.winner_battle_tag ?? null),
  };
}

export default function MatchPage({ match, lineups, mvp }: Props) {
  const t = useT(nsMatchDetail);
  const locale = useLocale();
  if (!match) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>{t.notFound}</p>
      </div>
    );
  }

  const t1 = match.team1;
  const t2 = match.team2;
  const isBye = match.is_bye;

  const t1Name = t1?.short_name || t1?.name || t.teamFallback1;
  const t2Name =
    t2?.short_name || t2?.name || (isBye ? t.bye : t.teamFallback2);

  const statusLabel = getMatchStatusLabel(match.status, t);
  const statusChipClass = getMatchStatusChipClass(match.status);
  const formatLabel = match.match_format?.toUpperCase() || 'BO?';
  const dateLabel = formatMatchDate(match.scheduled_at, locale);
  const completedLabel = formatMatchDate(match.completed_at, locale);

  const gameCount = match.games.length;
  const tournamentPath = `/tournament/${match.tournament.slug || match.tournament.id}`;

  const scoreLabel =
    match.status === 'finished' &&
    (match.team1_score !== null || match.team2_score !== null)
      ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">
        {/* Header / meta */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-3 text-[10px] uppercase tracking-wide">
                <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-pink-500/80 to-orange-400/80 text-black font-semibold">
                  OW Women&apos;s Cup
                </span>
                <span className="text-gray-200">
                  {match.tournament.game || 'Overwatch'}
                </span>
                <span className="w-[1px] h-3 bg-white/20" />
                <span className={statusChipClass}>{statusLabel}</span>
                <span className="w-[1px] h-3 bg-white/20" />
                <span className="px-1.5 py-[2px] rounded-full bg-black/60 border border-white/15 text-[9px] text-gray-300">
                  {formatLabel}
                </span>
              </div>

              <Heading typeStyle="heading-md" className="mb-1 text-gradient">
                {t1Name}{' '}
                {!isBye && <span className="text-gray-400">{t.vs}</span>}{' '}
                {t2Name}
              </Heading>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-300 mb-1">
                <Link href={tournamentPath} className="hover:text-white">
                  {match.tournament.short_name || match.tournament.name}
                </Link>
                {match.stage && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span>{match.stage.name}</span>
                  </>
                )}
                {match.round_name && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span>{match.round_name}</span>
                  </>
                )}
                {match.group_key && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span>
                      {t.poolPrefix} {match.group_key}
                    </span>
                  </>
                )}
              </div>

              <Paragraph typeStyle="body-sm" textColor="text-gray-200">
                {t.summary}
              </Paragraph>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                as="link"
                href={tournamentPath}
                className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
              >
                {t.btnTournament}
              </Button>
              <Button
                as="link"
                href={`${tournamentPath}/matches`}
                className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
              >
                {t.btnAllMatches}
              </Button>
              <Button
                as="link"
                href={`${tournamentPath}/bracket`}
                className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-purple-400"
              >
                {t.btnBracket}
              </Button>
            </div>
          </div>
        </section>

        {/* Score banner */}
        <section className="mb-6">
          <div className="bg-black/60 border border-white/10 rounded-2xl px-4 py-4">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_minmax(0,1.4fr)] gap-3 items-center">
              {/* Team 1 */}
              <TeamHeader
                team={t1}
                fallbackName={t.teamFallback1}
                align="left"
              />

              {/* Score & meta */}
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">
                    {t.scoreGlobal}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-3xl font-semibold text-white">
                    {match.team1_score ?? 0}
                  </span>
                  <span className="text-lg text-gray-400">–</span>
                  <span className="text-3xl font-semibold text-white">
                    {match.team2_score ?? 0}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap justify-center gap-2 text-[10px] text-gray-400">
                  {dateLabel && <span>{dateLabel}</span>}
                  {completedLabel && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span>
                        {t.endPrefix} {completedLabel}
                      </span>
                    </>
                  )}
                  {gameCount > 0 && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span>
                        {format(
                          gameCount > 1 ? t.mapsPlayed_other : t.mapsPlayed_one,
                          { count: gameCount }
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Team 2 */}
              <TeamHeader
                team={t2}
                fallbackName={isBye ? t.bye : t.teamFallback2}
                align="right"
              />
            </div>
          </div>
        </section>

        {/* Compositions + MVP */}
        <MvpBanner match={match} lineups={lineups} mvp={mvp} t={t} />

        <LineupsSection match={match} lineups={lineups} mvp={mvp} t={t} />

        {/* Maps list + extra info */}
        <section className="grid grid-cols-1 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-6">
          {/* Maps */}
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                {t.mapsDetailTitle}
              </p>
              {gameCount > 0 && (
                <span className="text-[10px] text-gray-500">
                  {format(
                    gameCount > 1 ? t.mapsRecorded_other : t.mapsRecorded_one,
                    { count: gameCount }
                  )}
                </span>
              )}
            </div>

            {match.games.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.noMapsDetail}
              </Paragraph>
            )}

            {match.games.length > 0 && (
              <div className="space-y-2">
                {match.games.map((g, idx) => (
                  <MapRow
                    key={g.id}
                    index={idx}
                    game={g}
                    team1Name={t1Name}
                    team2Name={t2Name}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Extra infos */}
          <div className="space-y-4">
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                {t.matchInfo}
              </p>

              <dl className="space-y-1 text-[11px]">
                <InfoRow
                  label={t.infoTournament}
                  value={
                    <Link
                      href={tournamentPath}
                      className="text-blue-300 hover:text-blue-100"
                    >
                      {match.tournament.short_name || match.tournament.name}
                    </Link>
                  }
                />
                {match.stage && (
                  <InfoRow label={t.infoStage} value={match.stage.name} />
                )}
                {match.round_name && (
                  <InfoRow label={t.infoRound} value={match.round_name} />
                )}
                {match.group_key && (
                  <InfoRow label={t.infoPool} value={match.group_key} />
                )}
                <InfoRow label={t.infoFormat} value={formatLabel} />
                {match.lobby_code && (
                  <InfoRow
                    label={t.infoLobby}
                    value={
                      <code className="bg-black/60 border border-white/10 rounded px-1.5 py-[1px] text-[10px]">
                        {match.lobby_code}
                      </code>
                    }
                  />
                )}
                {match.stream_url && (
                  <InfoRow
                    label={t.infoStream}
                    value={
                      <a
                        href={match.stream_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-300 hover:text-emerald-100"
                      >
                        {t.viewStream}
                      </a>
                    }
                  />
                )}
                {match.replay_url && (
                  <InfoRow
                    label={t.infoReplay}
                    value={
                      <a
                        href={match.replay_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-300 hover:text-purple-100"
                      >
                        {t.viewVod}
                      </a>
                    }
                  />
                )}
                <InfoRow label={t.infoBye} value={isBye ? t.yes : t.no} />
              </dl>
            </div>

            {match.notes && (
              <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                  {t.staffNotes}
                </p>
                <p className="text-[11px] text-gray-200 whitespace-pre-wrap">
                  {match.notes}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * UI Components
 * ────────────────────────────────────────────*/

/**
 * Bandeau MVP du match. Affiché uniquement si le staff a importé la gagnante du
 * sondage Discord — c'est la seule distinction individuelle du site, elle mérite
 * mieux qu'une ligne dans un tableau.
 */
function MvpBanner({
  match,
  lineups,
  mvp,
  t,
}: {
  match: Match;
  lineups: MatchLineups;
  mvp: MatchMvp | null;
  t: MatchDict;
}) {
  const member = findMvpMember(lineups, mvp);
  const name = member ? lineupLabel(member) : (mvp?.battleTag ?? null);
  if (!name) return null;

  const team = member
    ? lineups.team1.some((m) => m.id === member.id)
      ? match.team1
      : match.team2
    : null;

  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-lg"
        >
          ★
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-amber-200/80">
            {t.mvpTitle}
          </p>
          <p className="truncate text-sm font-semibold text-white">
            {member?.user_id ? (
              <Link
                href={`/player/${encodeURIComponent(member.user_id)}`}
                className="hover:underline"
              >
                {name}
              </Link>
            ) : (
              name
            )}
            {team && (
              <span className="ml-2 text-[11px] font-normal text-gray-300">
                {team.short_name || team.name}
              </span>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Compositions des deux équipes. Section muette si aucune des deux n'a de
 * roster connu (matchs importés, équipes TBD) — un titre suivi de deux cadres
 * vides n'apprend rien.
 */
function LineupsSection({
  match,
  lineups,
  mvp,
  t,
}: {
  match: Match;
  lineups: MatchLineups;
  mvp: MatchMvp | null;
  t: MatchDict;
}) {
  if (lineups.team1.length === 0 && lineups.team2.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">
          {t.lineupsTitle}
        </p>
        <span className="text-[10px] text-gray-500">{t.lineupsHint}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LineupPanel
          team={match.team1}
          fallbackName={t.teamFallback1}
          members={lineups.team1}
          mvp={mvp}
          t={t}
        />
        <LineupPanel
          team={match.team2}
          fallbackName={match.is_bye ? t.bye : t.teamFallback2}
          members={lineups.team2}
          mvp={mvp}
          t={t}
        />
      </div>
    </section>
  );
}

function LineupPanel({
  team,
  fallbackName,
  members,
  mvp,
  t,
}: {
  team: SimpleTeam | null;
  fallbackName: string;
  members: LineupMember[];
  mvp: MatchMvp | null;
  t: MatchDict;
}) {
  const { roster, subs, staff } = splitTeamMembers(members);
  const teamName = team?.name || fallbackName;

  return (
    <div className="rounded-2xl border border-white/5 bg-black/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
          {team?.slug ? (
            <Link href={`/team/${team.slug}`} className="hover:underline">
              {teamName}
            </Link>
          ) : (
            teamName
          )}
        </p>
        <span className="text-[10px] text-gray-500">
          {format(roster.length > 1 ? t.lineupCount_other : t.lineupCount_one, {
            count: roster.length,
          })}
        </span>
      </div>

      {members.length === 0 ? (
        <p className="text-[11px] text-gray-400">{t.lineupEmpty}</p>
      ) : (
        <div className="space-y-3">
          <LineupGroup members={roster} mvp={mvp} t={t} />
          {subs.length > 0 && (
            <LineupGroup
              label={t.lineupSubs}
              members={subs}
              mvp={mvp}
              t={t}
              muted
            />
          )}
          {staff.length > 0 && (
            <LineupGroup
              label={t.lineupStaff}
              members={staff}
              mvp={mvp}
              t={t}
              muted
            />
          )}
        </div>
      )}
    </div>
  );
}

function LineupGroup({
  label,
  members,
  mvp,
  t,
  muted = false,
}: {
  label?: string;
  members: LineupMember[];
  mvp: MatchMvp | null;
  t: MatchDict;
  muted?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <div>
      {label && (
        <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
          {label}
        </p>
      )}
      <ul className="space-y-1">
        {members.map((member) => (
          <LineupRow
            key={member.id}
            member={member}
            isMvp={Boolean(mvp?.memberId && mvp.memberId === member.id)}
            muted={muted}
            t={t}
          />
        ))}
      </ul>
    </div>
  );
}

function LineupRow({
  member,
  isMvp,
  muted,
  t,
}: {
  member: LineupMember;
  isMvp: boolean;
  muted: boolean;
  t: MatchDict;
}) {
  const name = lineupLabel(member) || t.lineupUnknown;
  const nameClass = `truncate text-[12px] ${muted ? 'text-gray-300' : 'text-white'}`;

  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[9px] font-semibold text-gray-300"
      >
        {initials(name)}
      </span>
      {member.user_id ? (
        <Link
          href={`/player/${encodeURIComponent(member.user_id)}`}
          className={`${nameClass} hover:underline`}
        >
          {name}
        </Link>
      ) : (
        <span className={nameClass}>{name}</span>
      )}
      {member.is_captain && (
        <span
          className="shrink-0 text-[10px] text-amber-300"
          title={t.lineupCaptain}
          aria-label={t.lineupCaptain}
        >
          ★
        </span>
      )}
      {isMvp && (
        <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-[1px] text-[9px] uppercase tracking-wide text-amber-200">
          {t.mvpBadge}
        </span>
      )}
    </li>
  );
}

function TeamHeader({
  team,
  fallbackName,
  align,
}: {
  team: SimpleTeam | null;
  fallbackName: string;
  align: 'left' | 'right';
}) {
  const name = team?.short_name || team?.name || fallbackName;
  const fullName = team?.name || null;
  const logo = team?.logo_url || null;

  const containerClass =
    'flex items-center gap-3 ' +
    (align === 'right' ? 'justify-end text-right' : 'justify-start text-left');

  return (
    <div className={containerClass}>
      {align === 'left' && <TeamLogo logo={logo} name={name} />}

      <div className="flex flex-col">
        <span className="text-sm font-semibold text-white">
          {team ? (
            <Link
              href={`/team/${encodeURIComponent(team.slug || team.id)}`}
              className="hover:text-emerald-300"
            >
              {name}
            </Link>
          ) : (
            name
          )}
        </span>
        {fullName && fullName !== name && (
          <span className="text-[10px] text-gray-400">{fullName}</span>
        )}
      </div>

      {align === 'right' && <TeamLogo logo={logo} name={name} />}
    </div>
  );
}

function TeamLogo({ logo, name }: { logo: string | null; name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
      {logo ? (
        <Image
          src={logo}
          alt={name}
          width={40}
          height={40}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[10px] text-gray-400">{initials(name)}</span>
      )}
    </div>
  );
}

function MapRow({
  game,
  index,
  team1Name,
  team2Name,
  t,
}: {
  game: Game;
  index: number;
  team1Name: string;
  team2Name: string;
  t: MatchDict;
}) {
  const label = game.map_name || format(t.mapLabel, { n: index + 1 });
  const orderLabel =
    typeof game.map_order === 'number'
      ? `#${game.map_order + 1}`
      : `#${index + 1}`;

  const s1 = game.team1_score ?? 0;
  const s2 = game.team2_score ?? 0;

  const isTiebreaker = !!game.is_tiebreaker;
  const isOT = !!game.went_overtime;

  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 bg-white/3 text-[11px] flex flex-col gap-[2px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-[1px] rounded-full bg-black/60 border border-white/10 text-[9px] text-gray-300">
            {orderLabel}
          </span>
          <span className="text-gray-100 text-xs">{label}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-gray-300">
          <span>{s1}</span>
          <span className="text-gray-500">-</span>
          <span>{s2}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-300">
            {team1Name} {t.vs} {team2Name}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {isTiebreaker && (
            <span className="px-1.5 py-[1px] rounded-full bg-fuchsia-500/20 border border-fuchsia-400/70 text-[9px] text-fuchsia-100">
              {t.tagTiebreaker}
            </span>
          )}
          {isOT && (
            <span className="px-1.5 py-[1px] rounded-full bg-amber-500/20 border border-amber-400/70 text-[9px] text-amber-100">
              {t.tagOvertime}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-gray-100 text-right">{value}</dd>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Utils (cohérents avec les pages tournoi)
 * ────────────────────────────────────────────*/

function formatMatchDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMatchStatusLabel(status: MatchStatus, t: MatchDict): string {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function getMatchStatusChipClass(status: MatchStatus): string {
  switch (status) {
    case 'pending':
      return 'px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60';
    case 'ongoing':
      return 'px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60';
    case 'finished':
      return 'px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60';
    case 'cancelled':
      return 'px-1.5 py-[2px] rounded-full bg-red-500/20 text-red-200 border border-red-500/60';
    default:
      return 'px-1.5 py-[2px] rounded-full bg-white/10 text-white border border-white/30';
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
