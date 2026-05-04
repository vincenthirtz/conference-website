// pages/team/[slug]/index.tsx

import { useState } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import PublicScrimDialog from '@/components/Team/PublicScrimDialog';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { hasTeamPermission } from '@/utils/teams/permissions';
import {
  renderTeamPublicMarkdown,
  normalizeAccentColor,
  normalizeBannerOverlay,
  normalizeBannerFocal,
  type BannerOverlay,
  type BannerFocal,
  type Achievement,
  type Sponsor,
} from '@/utils/markdown/teamPublicMarkdown';

import { logger } from '../../../utils/logger';
function safeHref(url: string): string | undefined {
  try {
    const full = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(full);
    if (['http:', 'https:'].includes(parsed.protocol)) return full;
    return undefined;
  } catch {
    return undefined;
  }
}

function socialHref(
  platform: 'twitter' | 'youtube' | 'twitch' | 'instagram' | 'tiktok',
  raw: string | null | undefined
): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return safeHref(value);
  }
  const handle = value.replace(/^@/, '');
  switch (platform) {
    case 'twitter':
      return safeHref(`https://twitter.com/${handle}`);
    case 'youtube':
      // Allow either an @handle or a raw channel name
      return safeHref(`https://youtube.com/@${handle}`);
    case 'twitch':
      return safeHref(`https://twitch.tv/${handle}`);
    case 'instagram':
      return safeHref(`https://instagram.com/${handle}`);
    case 'tiktok':
      return safeHref(`https://tiktok.com/@${handle}`);
  }
}

type Team = {
  id: string;
  slug?: string | null;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  country?: string | null;
  description?: string | null;
  bio?: string | null;
  public_content?: string | null;
  accent_color?: string | null;
  secondary_color?: string | null;
  banner_overlay?: string | null;
  banner_focal?: string | null;
  twitter?: string | null;
  discord?: string | null;
  website?: string | null;
  youtube?: string | null;
  twitch?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  achievements?: Achievement[] | null;
  sponsors?: Sponsor[] | null;
  embed_provider?: string | null;
  embed_id?: string | null;
  pinned_announcement?: string | null;
  pinned_announcement_until?: string | null;
  is_active?: boolean;
  captain_id?: string | null;
  created_at: string;
};

type TeamMember = {
  id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  is_captain?: boolean;
  is_substitute?: boolean;
  display_name?: string | null;
  specialty?: string | null;
  avatar_url?: string | null;
  pronouns?: string | null;
  tagline?: string | null;
  twitter?: string | null;
  twitch?: string | null;
  created_at: string;
};

type Tournament = {
  id: string;
  name: string;
  slug?: string | null;
  game?: string | null;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  logo_url?: string | null;
};

type MatchStats = {
  total: number;
  wins: number;
  losses: number;
  draws: number;
};

type RecentMatch = {
  id: string;
  scheduled_at: string | null;
  status: string;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  round_name?: string | null;
  opponent: {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
  } | null;
  tournament: {
    id: string;
    name: string;
  } | null;
  isTeam1: boolean;
};

type TeamPageProps = {
  team: Team;
  members: TeamMember[];
  tournaments: Tournament[];
  matchStats: MatchStats;
  recentMatches: RecentMatch[];
  canEdit: boolean;
  embedHost: string;
  announcementActive: boolean;
};

export const getServerSideProps: GetServerSideProps<TeamPageProps> = async (
  ctx
) => {
  const slug = ctx.params?.slug as string;
  if (!slug) {
    return { notFound: true };
  }

  // 1) Try lookup by slug (primary) — falls back to id/name/short_name for
  //    backwards compat with old URLs.
  let team: Team | null = null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slug
    );

  const { data: teamBySlug } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (teamBySlug) team = teamBySlug;

  if (!team && isUuid) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('id', slug)
      .maybeSingle();
    if (data) team = data;
  }

  if (!team) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select('*')
      .ilike('name', slug)
      .maybeSingle();
    if (data) team = data;
  }

  if (!team) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select('*')
      .ilike('short_name', slug)
      .maybeSingle();
    if (data) team = data;
  }

  if (!team) {
    return { notFound: true };
  }

  // Only show active teams
  if (team.is_active === false) {
    return { notFound: true };
  }

  const teamId = team.id;

  // 2) Fetch members
  const { data: rawMembers, error: membersError } = await supabaseAdmin
    .from('team_members')
    .select(
      'id, user_id, role, battle_tag, is_substitute, display_name, specialty, avatar_url, pronouns, tagline, twitter, twitch, created_at'
    )
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });

  if (membersError) {
    logger.error('Error fetching team members:', membersError);
  }

  // Compute is_captain based on team.captain_id
  const membersWithCaptain = (rawMembers || []).map((m: any) => ({
    ...m,
    is_captain: team.captain_id === m.user_id,
  }));
  // Sort captain first
  membersWithCaptain.sort((a: any, b: any) => {
    if (a.is_captain && !b.is_captain) return -1;
    if (!a.is_captain && b.is_captain) return 1;
    return 0;
  });
  const members = membersWithCaptain;

  // 3) Fetch tournaments (via multiple sources)
  let tournaments: Tournament[] = [];
  const seenTournaments = new Set<string>();

  // Try tournament_registrations
  const { data: registrations } = await supabaseAdmin
    .from('tournament_registrations')
    .select(
      `
      tournament:tournaments (
        id, name, slug, game, status, start_date, end_date, logo_url
      )
    `
    )
    .eq('team_id', teamId);

  if (registrations) {
    registrations.forEach((r: any) => {
      if (r.tournament && !seenTournaments.has(r.tournament.id)) {
        seenTournaments.add(r.tournament.id);
        tournaments.push(r.tournament);
      }
    });
  }

  // Try tournament_teams
  const { data: tournamentTeams } = await supabaseAdmin
    .from('tournament_teams')
    .select(
      `
      tournament:tournaments (
        id, name, slug, game, status, start_date, end_date, logo_url
      )
    `
    )
    .eq('team_id', teamId);

  if (tournamentTeams) {
    tournamentTeams.forEach((tt: any) => {
      if (tt.tournament && !seenTournaments.has(tt.tournament.id)) {
        seenTournaments.add(tt.tournament.id);
        tournaments.push(tt.tournament);
      }
    });
  }

  // Try stage_teams
  const { data: stageTeams } = await supabaseAdmin
    .from('stage_teams')
    .select(
      `
      stage:tournament_stages (
        tournament:tournaments (
          id, name, slug, game, status, start_date, end_date, logo_url
        )
      )
    `
    )
    .eq('team_id', teamId);

  if (stageTeams) {
    stageTeams.forEach((st: any) => {
      const t = st.stage?.tournament;
      if (t && !seenTournaments.has(t.id)) {
        seenTournaments.add(t.id);
        tournaments.push(t);
      }
    });
  }

  // 4) Fetch match stats - use winner_team_id for accurate results
  const { data: allMatches } = await supabaseAdmin
    .from('matches')
    .select(
      'id, status, team1_id, team2_id, team1_score, team2_score, winner_team_id'
    )
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .in('status', ['finished', 'completed', 'done']);

  let wins = 0;
  let losses = 0;
  let draws = 0;

  (allMatches || []).forEach((m: any) => {
    const isTeam1 = m.team1_id === teamId;
    const ourScore = isTeam1 ? m.team1_score : m.team2_score;
    const theirScore = isTeam1 ? m.team2_score : m.team1_score;

    // Method 1: Use winner_team_id if available
    if (m.winner_team_id) {
      if (m.winner_team_id === teamId) wins++;
      else losses++;
    }
    // Method 2: Fallback to score comparison
    else if (ourScore !== null && theirScore !== null) {
      if (ourScore > theirScore) wins++;
      else if (ourScore < theirScore) losses++;
      else draws++;
    }
  });

  const matchStats: MatchStats = {
    total: allMatches?.length || 0,
    wins,
    losses,
    draws,
  };

  // 5) Recent matches
  const { data: recentMatchesData, error: matchesError } = await supabaseAdmin
    .from('matches')
    .select('*')
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .limit(10);

  if (matchesError) {
    logger.error('Error fetching recent matches:', matchesError);
  }

  // Fetch opponent teams and tournaments separately
  const opponentIds = new Set<string>();
  const tournamentIds = new Set<string>();
  (recentMatchesData || []).forEach((m: any) => {
    if (m.team1_id && m.team1_id !== teamId) opponentIds.add(m.team1_id);
    if (m.team2_id && m.team2_id !== teamId) opponentIds.add(m.team2_id);
    if (m.tournament_id) tournamentIds.add(m.tournament_id);
  });

  const { data: opponentTeams } =
    opponentIds.size > 0
      ? await supabaseAdmin
          .from('teams')
          .select('id, name, short_name, logo_url')
          .in('id', Array.from(opponentIds))
      : { data: [] };

  const { data: tournamentData } =
    tournamentIds.size > 0
      ? await supabaseAdmin
          .from('tournaments')
          .select('id, name')
          .in('id', Array.from(tournamentIds))
      : { data: [] };

  const teamsMap = new Map((opponentTeams || []).map((t: any) => [t.id, t]));
  const tournamentsMap = new Map(
    (tournamentData || []).map((t: any) => [t.id, t])
  );

  const recentMatches: RecentMatch[] = (recentMatchesData || []).map(
    (m: any) => {
      const isTeam1 = m.team1_id === teamId;
      const opponentId = isTeam1 ? m.team2_id : m.team1_id;
      return {
        id: m.id,
        scheduled_at: m.scheduled_at,
        status: m.status,
        team1_score: m.team1_score,
        team2_score: m.team2_score,
        winner_team_id: m.winner_team_id,
        round_name: m.round_name,
        opponent: opponentId ? teamsMap.get(opponentId) || null : null,
        tournament: m.tournament_id
          ? tournamentsMap.get(m.tournament_id) || null
          : null,
        isTeam1,
      };
    }
  );

  // Detect whether the current viewer is allowed to edit this team's
  // public page (captain or member with `edit_public_page` permission).
  let canEdit = false;
  try {
    const authClient = getServerClient(ctx.req, ctx.res);
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (user) {
      canEdit = await hasTeamPermission(user.id, teamId, 'edit_public_page');
    }
  } catch (err) {
    logger.error('[team page] permission check error:', err);
  }

  // Used by the Twitch embed iframe (`parent` query param). Falls back to
  // localhost in dev when the host header is missing.
  const rawHost = (ctx.req.headers.host as string | undefined) ?? 'localhost';
  const embedHost = rawHost.split(':')[0] || 'localhost';

  // Compute the "is the announcement still active?" flag at request time so
  // the render is pure (Date.now is forbidden during render by react-hooks
  // rules). The page is SSR-only, so the freshness window is a single tick.
  const announcementActive =
    !!team.pinned_announcement &&
    (!team.pinned_announcement_until ||
      new Date(team.pinned_announcement_until).getTime() > Date.now());

  return {
    props: {
      team: team as Team,
      members: (members || []) as TeamMember[],
      tournaments,
      matchStats,
      recentMatches,
      canEdit,
      embedHost,
      announcementActive,
    },
  };
};

export default function TeamPage({
  team,
  members,
  tournaments,
  matchStats,
  recentMatches,
  canEdit,
  embedHost,
  announcementActive,
}: TeamPageProps) {
  const winRate =
    matchStats.total > 0
      ? Math.round((matchStats.wins / matchStats.total) * 100)
      : 0;

  const activeTournaments = tournaments.filter(
    (t) =>
      t.status === 'running' ||
      t.status === 'ongoing' ||
      t.status === 'published'
  );

  const hasSocials =
    team.twitter ||
    team.discord ||
    team.website ||
    team.youtube ||
    team.twitch ||
    team.instagram ||
    team.tiktok;
  const description = team.description || team.bio;
  const [scrimDialogOpen, setScrimDialogOpen] = useState(false);
  const accent = normalizeAccentColor(team.accent_color);
  const secondary = normalizeAccentColor(team.secondary_color);
  const overlay: BannerOverlay =
    normalizeBannerOverlay(team.banner_overlay) ?? 'gradient';
  const focal: BannerFocal = normalizeBannerFocal(team.banner_focal) ?? 'center';
  const richContent = renderTeamPublicMarkdown(team.public_content);
  const editHref = `/team/${encodeURIComponent(team.slug || team.id)}/edit`;
  const gradientStops = secondary && accent ? `${accent}, ${secondary}` : null;

  const achievements = (team.achievements ?? []).filter((a) => a && a.title);
  const sponsors = (team.sponsors ?? []).filter((s) => s && s.name);

  const embedSrc =
    team.embed_provider === 'youtube' && team.embed_id
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(team.embed_id)}`
      : team.embed_provider === 'twitch' && team.embed_id
        ? `https://player.twitch.tv/?channel=${encodeURIComponent(team.embed_id)}&parent=${encodeURIComponent(embedHost)}`
        : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{team.name} | OW Women&apos;s Cup</title>
        <meta
          name="description"
          content={description || `Page de l'équipe ${team.name}`}
        />
      </Head>

      {/* Pinned announcement */}
      {announcementActive && (
        <div
          className="w-full px-4 py-2 text-center text-sm font-medium text-black"
          style={{
            backgroundImage: gradientStops
              ? `linear-gradient(90deg, ${accent}, ${secondary})`
              : undefined,
            backgroundColor: gradientStops ? undefined : accent ?? '#fbbf24',
          }}
        >
          {team.pinned_announcement}
        </div>
      )}

      {/* Banner */}
      {team.banner_url && (
        <div className="relative h-48 md:h-64 w-full overflow-hidden">
          <Image
            src={team.banner_url}
            alt=""
            fill
            className={`object-cover ${overlay === 'none' ? '' : 'opacity-60'}`}
            style={{ objectPosition: focal }}
          />
          <BannerOverlayLayer
            overlay={overlay}
            accent={accent}
            secondary={secondary}
          />
        </div>
      )}

      <main
        className={`container mx-auto px-4 max-w-6xl pb-16 ${team.banner_url ? '-mt-20 relative z-10' : 'pt-24'}`}
      >
        {/* Header */}
        <section className="mb-10">
          <div className="flex flex-col md:flex-row md:items-end gap-6">
            {/* Logo */}
            <div className="flex-shrink-0">
              <div
                className="rounded-2xl p-1 shadow-2xl"
                style={
                  gradientStops
                    ? {
                        backgroundImage: `linear-gradient(135deg, ${accent}, ${secondary})`,
                      }
                    : {
                        backgroundColor: accent ?? 'rgba(255,255,255,0.1)',
                      }
                }
              >
                {team.logo_url ? (
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl bg-black/80 overflow-hidden">
                    <Image
                      src={team.logo_url}
                      alt={team.name}
                      width={144}
                      height={144}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
                    <span className="text-4xl font-bold text-neutral-500">
                      {initials(team.short_name || team.name)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                {team.short_name && (
                  <span className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-xs font-mono">
                    {team.short_name}
                  </span>
                )}
                {team.country && (
                  <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
                    {team.country}
                  </span>
                )}
                {team.is_active !== false && (
                  <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs">
                    Active
                  </span>
                )}
                {canEdit && (
                  <Link
                    href={editHref}
                    className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 text-xs"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Éditer la page
                  </Link>
                )}
              </div>

              <Heading typeStyle="heading-lg" className="text-gradient mb-2">
                {team.name}
              </Heading>

              {description && (
                <Paragraph
                  typeStyle="body-md"
                  textColor="text-gray-300"
                  className="max-w-2xl whitespace-pre-line"
                >
                  {description}
                </Paragraph>
              )}

              {/* Social links */}
              {hasSocials && (
                <div className="flex flex-wrap gap-3 mt-4">
                  <SocialLink
                    href={socialHref('twitter', team.twitter)}
                    label="Twitter"
                    hover="hover:border-blue-400/50 hover:bg-blue-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={team.discord ? safeHref(team.discord) : undefined}
                    label="Discord"
                    hover="hover:border-indigo-400/50 hover:bg-indigo-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={team.website ? safeHref(team.website) : undefined}
                    label="Site web"
                    hover="hover:border-white/30"
                    icon={
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
                          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                        />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('youtube', team.youtube)}
                    label="YouTube"
                    hover="hover:border-red-400/50 hover:bg-red-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M23.498 6.186a2.998 2.998 0 0 0-2.108-2.124C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.39.562A2.998 2.998 0 0 0 .502 6.186 31.46 31.46 0 0 0 0 12a31.46 31.46 0 0 0 .502 5.814 2.998 2.998 0 0 0 2.108 2.124C4.495 20.5 12 20.5 12 20.5s7.505 0 9.39-.562a2.998 2.998 0 0 0 2.108-2.124A31.46 31.46 0 0 0 24 12a31.46 31.46 0 0 0-.502-5.814zM9.75 15.568V8.432L15.818 12 9.75 15.568z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('twitch', team.twitch)}
                    label="Twitch"
                    hover="hover:border-purple-400/50 hover:bg-purple-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657L23.463 14.9V0H2.149zm1.612 1.612h17.985v12.298l-3.582 3.582h-5.731l-3.045 3.045v-3.045H3.761V1.612zm6.985 11.582h1.612V6.642h-1.612v6.552zm4.478 0h1.612V6.642h-1.612v6.552z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('instagram', team.instagram)}
                    label="Instagram"
                    hover="hover:border-pink-400/50 hover:bg-pink-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('tiktok', team.tiktok)}
                    label="TikTok"
                    hover="hover:border-cyan-400/50 hover:bg-cyan-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.93a8.16 8.16 0 0 0 4.77 1.52V7a4.85 4.85 0 0 1-1.84-.31z" />
                      </svg>
                    }
                  />
                </div>
              )}
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 md:w-auto w-full">
              <StatCard label="Matchs" value={matchStats.total} />
              <StatCard
                label="Victoires"
                value={matchStats.wins}
                hint={matchStats.total > 0 ? `${winRate}%` : undefined}
                color="emerald"
              />
              <StatCard
                label="Défaites"
                value={matchStats.losses}
                color="red"
              />
              <StatCard label="Membres" value={members.length} />
            </div>
          </div>
        </section>

        {/* Rich content authored by the team */}
        {richContent && (
          <section
            className="mb-6 rounded-2xl border bg-black/40 px-5 py-5 relative overflow-hidden"
            style={{
              borderColor: accent
                ? `${accent}40` // ~25% alpha
                : 'rgba(255,255,255,0.08)',
            }}
          >
            {gradientStops && (
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${accent}, ${secondary})`,
                }}
              />
            )}
            <div className="prose prose-invert max-w-none">{richContent}</div>
          </section>
        )}

        {/* Embed (Twitch/YouTube) */}
        {embedSrc && (
          <section
            className="mb-6 rounded-2xl border border-white/5 bg-black/40 overflow-hidden"
          >
            <div className="aspect-video w-full">
              <iframe
                src={embedSrc}
                title={`Stream ${team.name}`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="w-full h-full"
              />
            </div>
          </section>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <section className="mb-6 rounded-2xl border border-white/5 bg-black/60 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-4">
              Palmarès
            </p>
            <ul className="space-y-2">
              {achievements.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: accent ? `${accent}33` : 'rgba(251,191,36,0.2)',
                      color: accent ?? '#fbbf24',
                    }}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">
                      {a.title}
                    </p>
                    {(a.tournament || a.date) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a.tournament}
                        {a.tournament && a.date ? ' • ' : ''}
                        {a.date
                          ? new Date(a.date).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : ''}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Sponsors */}
        {sponsors.length > 0 && (
          <section className="mb-6 rounded-2xl border border-white/5 bg-black/60 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-4">
              Sponsors & partenaires
            </p>
            <div className="flex flex-wrap gap-3">
              {sponsors.map((s, i) => (
                <SponsorTile key={i} sponsor={s} />
              ))}
            </div>
          </section>
        )}

        {/* Public scrim CTA */}
        <section className="mb-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cyan-200">
              Tu veux affronter {team.name} en scrim ?
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Pas besoin de compte — laisse un contact, le capitaine te
              répondra.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setScrimDialogOpen(true)}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-medium text-white"
          >
            Proposer un scrim
          </button>
        </section>

        <PublicScrimDialog
          teamId={team.id}
          teamName={team.name}
          open={scrimDialogOpen}
          onClose={() => setScrimDialogOpen(false)}
        />

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Members */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              {(() => {
                const rosterMembers = members.filter(
                  (m) => !m.is_substitute
                );
                const subMembers = members.filter((m) => m.is_substitute);

                return (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        Roster
                      </p>
                      <span className="text-xs text-gray-500">
                        {rosterMembers.length} titulaire
                        {rosterMembers.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {rosterMembers.length === 0 ? (
                      <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                        Aucun membre affiché pour cette équipe.
                      </Paragraph>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {rosterMembers.map((member) => (
                          <MemberCard
                            key={member.id}
                            member={member}
                            accent={accent}
                          />
                        ))}
                      </div>
                    )}

                    {subMembers.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Remplaçantes
                          </p>
                          <span className="text-xs text-gray-600">
                            {subMembers.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {subMembers.map((member) => (
                            <MemberCard
                              key={member.id}
                              member={member}
                              accent={accent}
                              substitute
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* Recent Matches */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Matchs récents
                </p>
              </div>

              {recentMatches.length === 0 ? (
                <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                  Aucun match récent.
                </Paragraph>
              ) : (
                <div className="space-y-2">
                  {recentMatches.slice(0, 6).map((match) => (
                    <MatchCard key={match.id} match={match} teamId={team.id} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Tournaments */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Tournois
                </p>
                <span className="text-xs text-gray-500">
                  {tournaments.length} tournoi
                  {tournaments.length > 1 ? 's' : ''}
                </span>
              </div>

              {tournaments.length === 0 ? (
                <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                  Aucun tournoi pour le moment.
                </Paragraph>
              ) : (
                <div className="space-y-2">
                  {tournaments.slice(0, 8).map((tournament) => (
                    <Link
                      key={tournament.id}
                      href={`/tournament/${tournament.slug || tournament.id}`}
                    >
                      <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:border-emerald-400/50 hover:bg-emerald-500/5 transition-colors cursor-pointer group">
                        {tournament.logo_url ? (
                          <Image
                            src={tournament.logo_url}
                            alt=""
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-purple-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                              />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-300 transition-colors">
                            {tournament.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{tournament.game || 'Overwatch'}</span>
                            <span className="text-gray-600">•</span>
                            <StatusBadge status={tournament.status} />
                          </div>
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors"
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
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Quick Stats */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-4">
                Statistiques
              </p>

              <div className="space-y-4">
                {/* Win rate bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-400">Win rate</span>
                    <span className="text-white font-semibold">{winRate}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${gradientStops ? '' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'}`}
                      style={{
                        width: `${winRate}%`,
                        ...(gradientStops
                          ? {
                              backgroundImage: `linear-gradient(90deg, ${accent}, ${secondary})`,
                            }
                          : {}),
                      }}
                    />
                  </div>
                </div>

                {/* Stats breakdown */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-3">
                    <p className="text-lg font-bold text-emerald-300">
                      {matchStats.wins}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase">
                      Victoires
                    </p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-3">
                    <p className="text-lg font-bold text-red-300">
                      {matchStats.losses}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase">
                      Défaites
                    </p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl py-3">
                    <p className="text-lg font-bold text-gray-300">
                      {matchStats.draws}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase">Nuls</p>
                  </div>
                </div>

                {/* Active in tournaments */}
                {activeTournaments.length > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-xs text-gray-400 mb-2">
                      Actuellement en compétition dans :
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeTournaments.slice(0, 3).map((t) => (
                        <Link key={t.id} href={`/tournament/${t.slug || t.id}`}>
                          <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/40 text-[10px] hover:bg-purple-500/30 transition-colors cursor-pointer">
                            {t.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Components & utils
 * ────────────────────────────────────────────*/

const SPECIALTY_STYLE: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  tank: {
    label: 'Tank',
    bg: 'bg-orange-500/20 border-orange-500/40',
    text: 'text-orange-200',
  },
  dps: {
    label: 'DPS',
    bg: 'bg-red-500/20 border-red-500/40',
    text: 'text-red-200',
  },
  support: {
    label: 'Support',
    bg: 'bg-emerald-500/20 border-emerald-500/40',
    text: 'text-emerald-200',
  },
  flex: {
    label: 'Flex',
    bg: 'bg-purple-500/20 border-purple-500/40',
    text: 'text-purple-200',
  },
};

function memberInitials(member: TeamMember): string {
  const source = member.display_name || member.battle_tag || 'M';
  const parts = source.trim().split(/[\s#-]+/).filter(Boolean);
  if (parts.length === 0) return 'M';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function MemberCard({
  member,
  accent,
  substitute,
}: {
  member: TeamMember;
  accent: string | null;
  substitute?: boolean;
}) {
  const name = member.display_name || member.battle_tag || 'Membre';
  const specialtyStyle =
    member.specialty && SPECIALTY_STYLE[member.specialty.toLowerCase()];
  const avatar =
    member.avatar_url && safeHref(member.avatar_url) ? member.avatar_url : null;
  const twitterHref = socialHref('twitter', member.twitter ?? null);
  const twitchHref = socialHref('twitch', member.twitch ?? null);

  const containerClasses = substitute
    ? 'bg-white/[0.02] border-dashed border-white/10'
    : member.is_captain
      ? 'bg-amber-500/10 border-amber-500/30'
      : 'bg-white/5 border-white/10';

  return (
    <div
      className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${containerClasses}`}
    >
      <div className="flex-shrink-0">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            loading="lazy"
            className="w-12 h-12 rounded-lg object-cover border border-white/10"
            style={accent ? { borderColor: `${accent}66` } : undefined}
          />
        ) : (
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-semibold ${
              member.is_captain
                ? 'bg-amber-500/20 border border-amber-500/30 text-amber-200'
                : 'bg-gradient-to-br from-neutral-700 to-neutral-800 text-neutral-200'
            }`}
            style={
              !member.is_captain && accent
                ? {
                    borderColor: `${accent}66`,
                    color: accent,
                  }
                : undefined
            }
          >
            {memberInitials(member)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={`text-sm font-semibold truncate ${substitute ? 'text-gray-300' : 'text-white'}`}
          >
            {name}
          </p>
          {member.is_captain && (
            <svg
              className="w-4 h-4 text-amber-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-label="Capitaine"
            >
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
          )}
          {specialtyStyle && (
            <span
              className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${specialtyStyle.bg} ${specialtyStyle.text}`}
            >
              {specialtyStyle.label}
            </span>
          )}
          {substitute && (
            <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-gray-300">
              Remplaçante
            </span>
          )}
        </div>
        {(member.pronouns || member.battle_tag) && (
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
            {member.pronouns}
            {member.pronouns && member.battle_tag ? ' • ' : ''}
            {member.battle_tag && member.battle_tag !== name
              ? member.battle_tag
              : ''}
          </p>
        )}
        {member.tagline && (
          <p className="text-xs text-gray-300 italic mt-1 line-clamp-2">
            {member.tagline}
          </p>
        )}
        {(twitterHref || twitchHref) && (
          <div className="flex items-center gap-2 mt-1.5">
            {twitterHref && (
              <a
                href={twitterHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Twitter"
                className="text-gray-400 hover:text-blue-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            )}
            {twitchHref && (
              <a
                href={twitchHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Twitch"
                className="text-gray-400 hover:text-purple-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657L23.463 14.9V0H2.149zm1.612 1.612h17.985v12.298l-3.582 3.582h-5.731l-3.045 3.045v-3.045H3.761V1.612zm6.985 11.582h1.612V6.642h-1.612v6.552zm4.478 0h1.612V6.642h-1.612v6.552z" />
                </svg>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SponsorTile({ sponsor }: { sponsor: Sponsor }) {
  const safe = sponsor.url ? safeHref(sponsor.url) : undefined;
  const inner = (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2 hover:border-white/30 transition-colors">
      {sponsor.logo_url && safeHref(sponsor.logo_url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sponsor.logo_url}
          alt={sponsor.name}
          className="w-8 h-8 rounded-md object-contain bg-white/10"
          loading="lazy"
        />
      ) : (
        <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-xs font-semibold text-white">
          {sponsor.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="text-sm text-white">{sponsor.name}</span>
    </div>
  );
  if (safe) {
    return (
      <a href={safe} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}

function SocialLink({
  href,
  label,
  icon,
  hover,
}: {
  href: string | undefined;
  label: string;
  icon: React.ReactNode;
  hover: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 transition-colors text-xs ${hover}`}
    >
      {icon}
      {label}
    </a>
  );
}

function BannerOverlayLayer({
  overlay,
  accent,
  secondary,
}: {
  overlay: BannerOverlay;
  accent: string | null;
  secondary: string | null;
}) {
  if (overlay === 'none') return null;
  if (overlay === 'dark') {
    return <div className="absolute inset-0 bg-black/50" />;
  }
  if (overlay === 'grid') {
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </>
    );
  }
  if (overlay === 'dots') {
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.25) 1.2px, transparent 1.2px)',
            backgroundSize: '14px 14px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </>
    );
  }
  // 'gradient' (default): use accent/secondary tint when available, else black
  if (accent && secondary) {
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to top, ${accent}cc, ${secondary}33, transparent)`,
        }}
      />
    );
  }
  return (
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
  );
}

function StatCard({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: 'emerald' | 'red';
}) {
  const colorClasses = {
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
    red: 'from-red-500/20 to-red-500/5 border-red-500/30',
  };

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${color ? colorClasses[color] : 'from-white/8 via-white/5 to-white/0'} border ${color ? '' : 'border-white/10'} px-3 py-3`}
    >
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </p>
      <p className="text-xl font-semibold text-white">
        {typeof value === 'number' ? value.toString() : value}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-[2px]">{hint}</p>}
    </div>
  );
}

function MatchCard({ match, teamId }: { match: RecentMatch; teamId: string }) {
  // Consider match finished if status contains 'finish' or 'complete' or 'done'
  const isFinished =
    match.status === 'finished' ||
    match.status === 'completed' ||
    match.status === 'done' ||
    match.status?.toLowerCase().includes('finish');

  const ourScore = match.isTeam1 ? match.team1_score : match.team2_score;
  const theirScore = match.isTeam1 ? match.team2_score : match.team1_score;
  const hasScores = ourScore !== null && theirScore !== null;

  // Determine result: first check winner_team_id, then fallback to scores
  let result: 'win' | 'loss' | 'draw' | null = null;

  // Method 1: Use winner_team_id if available
  if (match.winner_team_id) {
    if (match.winner_team_id === teamId) {
      result = 'win';
    } else {
      result = 'loss';
    }
  }
  // Method 2: Fallback to score comparison if match is finished and has scores
  else if ((isFinished || hasScores) && hasScores) {
    if (ourScore > theirScore) {
      result = 'win';
    } else if (ourScore < theirScore) {
      result = 'loss';
    } else {
      result = 'draw';
    }
  }

  const resultColors = {
    win: 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300',
    loss: 'bg-red-500/30 border-red-500/50 text-red-300',
    draw: 'bg-yellow-500/30 border-yellow-500/50 text-yellow-300',
  };

  const dateStr = match.scheduled_at
    ? new Date(match.scheduled_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
      })
    : null;

  // Card border color based on result
  const cardBorderColor = result
    ? result === 'win'
      ? 'border-emerald-500/40 hover:border-emerald-500/60'
      : result === 'loss'
        ? 'border-red-500/40 hover:border-red-500/60'
        : 'border-yellow-500/40 hover:border-yellow-500/60'
    : 'border-white/10 hover:border-white/30';

  return (
    <Link href={`/match/${match.id}`}>
      <div
        className={`flex items-center gap-3 bg-white/5 border ${cardBorderColor} rounded-xl px-4 py-3 transition-colors cursor-pointer group`}
      >
        {/* Result indicator */}
        {result && (
          <div
            className={`w-10 h-10 rounded-lg border ${resultColors[result]} flex items-center justify-center text-sm font-bold`}
          >
            {result === 'win' ? 'V' : result === 'loss' ? 'D' : 'N'}
          </div>
        )}
        {!result && (
          <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-xs text-gray-400">
            —
          </div>
        )}

        {/* Match info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">
              vs {match.opponent?.short_name || match.opponent?.name || 'TBD'}
            </p>
            {ourScore !== null && theirScore !== null && (
              <span
                className={`text-sm font-bold font-mono ${
                  result === 'win'
                    ? 'text-emerald-400'
                    : result === 'loss'
                      ? 'text-red-400'
                      : 'text-gray-300'
                }`}
              >
                {ourScore} - {theirScore}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            {dateStr && <span>{dateStr}</span>}
            {match.round_name && (
              <>
                <span>•</span>
                <span>{match.round_name}</span>
              </>
            )}
            {match.tournament && (
              <>
                <span>•</span>
                <span className="truncate">{match.tournament.name}</span>
              </>
            )}
          </div>
        </div>

        <svg
          className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors flex-shrink-0"
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
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    running: { label: 'En cours', color: 'text-emerald-300' },
    ongoing: { label: 'En cours', color: 'text-emerald-300' },
    published: { label: 'À venir', color: 'text-yellow-300' },
    upcoming: { label: 'À venir', color: 'text-yellow-300' },
    finished: { label: 'Terminé', color: 'text-gray-400' },
    completed: { label: 'Terminé', color: 'text-gray-400' },
    draft: { label: 'Brouillon', color: 'text-gray-500' },
  };

  const config = statusConfig[status] || {
    label: status,
    color: 'text-gray-400',
  };

  return <span className={config.color}>{config.label}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
