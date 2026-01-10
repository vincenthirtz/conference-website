// @ts-nocheck
// pages/team/[slug].tsx

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { supabaseAdmin } from '@/utils/supabase';

type Team = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  country?: string | null;
  description?: string | null;
  bio?: string | null;
  twitter?: string | null;
  discord?: string | null;
  website?: string | null;
  is_active?: boolean;
  captain_id?: string | null;
  created_at: string;
};

type TeamMember = {
  id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_captain?: boolean;
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
};

export const getServerSideProps: GetServerSideProps<TeamPageProps> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  if (!slug) {
    return { notFound: true };
  }

  // 1) Try lookup by ID
  let team: Team | null = null;
  const { data: teamById } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', slug)
    .single();

  if (teamById) {
    team = teamById;
  }

  // 2) Try lookup by name (case-insensitive)
  if (!team) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select('*')
      .ilike('name', slug)
      .maybeSingle();
    if (data) team = data;
  }

  // 3) Try lookup by short_name
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
  const { data: rawMembers } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id, role, battle_tag, display_name, avatar_url, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });

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
    .select(`
      tournament:tournaments (
        id, name, slug, game, status, start_date, end_date, logo_url
      )
    `)
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
    .select(`
      tournament:tournaments (
        id, name, slug, game, status, start_date, end_date, logo_url
      )
    `)
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
    .from('tournament_stage_teams')
    .select(`
      stage:tournament_stages (
        tournament:tournaments (
          id, name, slug, game, status, start_date, end_date, logo_url
        )
      )
    `)
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

  // 4) Fetch match stats
  const { data: matchesAsTeam1 } = await supabaseAdmin
    .from('matches')
    .select('id, status, team1_score, team2_score')
    .eq('team1_id', teamId)
    .eq('status', 'finished');

  const { data: matchesAsTeam2 } = await supabaseAdmin
    .from('matches')
    .select('id, status, team1_score, team2_score')
    .eq('team2_id', teamId)
    .eq('status', 'finished');

  let wins = 0;
  let losses = 0;
  let draws = 0;

  (matchesAsTeam1 || []).forEach((m: any) => {
    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;
    if (s1 > s2) wins++;
    else if (s1 < s2) losses++;
    else draws++;
  });

  (matchesAsTeam2 || []).forEach((m: any) => {
    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;
    if (s2 > s1) wins++;
    else if (s2 < s1) losses++;
    else draws++;
  });

  const matchStats: MatchStats = {
    total: (matchesAsTeam1?.length || 0) + (matchesAsTeam2?.length || 0),
    wins,
    losses,
    draws,
  };

  // 5) Recent matches
  const { data: recentMatchesData } = await supabaseAdmin
    .from('matches')
    .select(`
      id,
      scheduled_at,
      status,
      team1_score,
      team2_score,
      round_name,
      team1_id,
      team2_id,
      team1:team1_id ( id, name, short_name, logo_url ),
      team2:team2_id ( id, name, short_name, logo_url ),
      tournament:tournaments ( id, name )
    `)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .order('scheduled_at', { ascending: false })
    .limit(10);

  const recentMatches: RecentMatch[] = (recentMatchesData || []).map((m: any) => {
    const isTeam1 = m.team1_id === teamId;
    return {
      id: m.id,
      scheduled_at: m.scheduled_at,
      status: m.status,
      team1_score: m.team1_score,
      team2_score: m.team2_score,
      round_name: m.round_name,
      opponent: isTeam1 ? m.team2 : m.team1,
      tournament: m.tournament,
      isTeam1,
    };
  });

  return {
    props: {
      team: team as Team,
      members: (members || []) as TeamMember[],
      tournaments,
      matchStats,
      recentMatches,
    },
  };
};

export default function TeamPage({
  team,
  members,
  tournaments,
  matchStats,
  recentMatches,
}: TeamPageProps) {
  const winRate = matchStats.total > 0
    ? Math.round((matchStats.wins / matchStats.total) * 100)
    : 0;

  const activeTournaments = tournaments.filter(t =>
    t.status === 'running' || t.status === 'ongoing' || t.status === 'published'
  );

  const hasSocials = team.twitter || team.discord || team.website;
  const description = team.description || team.bio;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{team.name} | OW Women&apos;s Cup</title>
        <meta name="description" content={description || `Page de l'équipe ${team.name}`} />
      </Head>

      {/* Banner */}
      {team.banner_url && (
        <div className="relative h-48 md:h-64 w-full overflow-hidden">
          <Image
            src={team.banner_url}
            alt=""
            fill
            className="object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        </div>
      )}

      <main className={`container mx-auto px-4 max-w-6xl pb-16 ${team.banner_url ? '-mt-20 relative z-10' : 'pt-24'}`}>
        {/* Header */}
        <section className="mb-10">
          <div className="flex flex-col md:flex-row md:items-end gap-6">
            {/* Logo */}
            <div className="flex-shrink-0">
              {team.logo_url ? (
                <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl border-4 border-white/10 bg-black/80 overflow-hidden shadow-2xl">
                  <Image
                    src={team.logo_url}
                    alt={team.name}
                    width={144}
                    height={144}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl border-4 border-white/10 bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center shadow-2xl">
                  <span className="text-4xl font-bold text-neutral-500">
                    {initials(team.short_name || team.name)}
                  </span>
                </div>
              )}
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
              </div>

              <Heading typeStyle="heading-lg" className="text-gradient mb-2">
                {team.name}
              </Heading>

              {description && (
                <Paragraph typeStyle="body-md" textColor="text-gray-300" className="max-w-2xl whitespace-pre-line">
                  {description}
                </Paragraph>
              )}

              {/* Social links */}
              {hasSocials && (
                <div className="flex flex-wrap gap-3 mt-4">
                  {team.twitter && (
                    <a
                      href={team.twitter.startsWith('http') ? team.twitter : `https://twitter.com/${team.twitter.replace('@', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-blue-400/50 hover:bg-blue-500/10 transition-colors text-xs"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Twitter
                    </a>
                  )}
                  {team.discord && (
                    <a
                      href={team.discord.startsWith('http') ? team.discord : `https://${team.discord}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-indigo-400/50 hover:bg-indigo-500/10 transition-colors text-xs"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                      Discord
                    </a>
                  )}
                  {team.website && (
                    <a
                      href={team.website.startsWith('http') ? team.website : `https://${team.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 transition-colors text-xs"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Site web
                    </a>
                  )}
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
              <StatCard label="Défaites" value={matchStats.losses} color="red" />
              <StatCard label="Membres" value={members.length} />
            </div>
          </div>
        </section>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Members */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Roster
                </p>
                <span className="text-xs text-gray-500">
                  {members.length} membre{members.length > 1 ? 's' : ''}
                </span>
              </div>

              {members.length === 0 ? (
                <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                  Aucun membre affiché pour cette équipe.
                </Paragraph>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                        member.is_captain
                          ? 'bg-amber-500/10 border border-amber-500/30'
                          : 'bg-white/5 border border-white/10'
                      }`}
                    >
                      {member.avatar_url ? (
                        <Image
                          src={member.avatar_url}
                          alt=""
                          width={40}
                          height={40}
                          className={`w-10 h-10 rounded-lg object-cover ${
                            member.is_captain ? 'border-2 border-amber-500/50' : 'border border-white/10'
                          }`}
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          member.is_captain
                            ? 'bg-amber-500/20 border border-amber-500/30'
                            : 'bg-gradient-to-br from-neutral-700 to-neutral-800'
                        }`}>
                          {member.is_captain ? (
                            <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">
                            {member.battle_tag || member.display_name || 'Membre'}
                          </p>
                          {member.is_captain && (
                            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                          {member.is_captain && (
                            <span className="text-[10px] text-amber-400 font-semibold">Capitaine</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  {tournaments.length} tournoi{tournaments.length > 1 ? 's' : ''}
                </span>
              </div>

              {tournaments.length === 0 ? (
                <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                  Aucun tournoi pour le moment.
                </Paragraph>
              ) : (
                <div className="space-y-2">
                  {tournaments.slice(0, 8).map((tournament) => (
                    <Link key={tournament.id} href={`/tournament/${tournament.slug || tournament.id}`}>
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
                            <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-300 transition-colors">
                            {tournament.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{tournament.game || 'Overwatch 2'}</span>
                            <span className="text-gray-600">•</span>
                            <StatusBadge status={tournament.status} />
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                      style={{ width: `${winRate}%` }}
                    />
                  </div>
                </div>

                {/* Stats breakdown */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-3">
                    <p className="text-lg font-bold text-emerald-300">{matchStats.wins}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Victoires</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-3">
                    <p className="text-lg font-bold text-red-300">{matchStats.losses}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Défaites</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl py-3">
                    <p className="text-lg font-bold text-gray-300">{matchStats.draws}</p>
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
    <div className={`rounded-2xl bg-gradient-to-br ${color ? colorClasses[color] : 'from-white/8 via-white/5 to-white/0'} border ${color ? '' : 'border-white/10'} px-3 py-3`}>
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
  const isFinished = match.status === 'finished';
  const ourScore = match.isTeam1 ? match.team1_score : match.team2_score;
  const theirScore = match.isTeam1 ? match.team2_score : match.team1_score;

  let result: 'win' | 'loss' | 'draw' | null = null;
  if (isFinished && ourScore !== null && theirScore !== null) {
    if (ourScore > theirScore) result = 'win';
    else if (ourScore < theirScore) result = 'loss';
    else result = 'draw';
  }

  const resultColors = {
    win: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    loss: 'bg-red-500/20 border-red-500/40 text-red-300',
    draw: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
  };

  const dateStr = match.scheduled_at
    ? new Date(match.scheduled_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
      })
    : null;

  return (
    <Link href={`/match/${match.id}`}>
      <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:border-white/30 transition-colors cursor-pointer group">
        {/* Result indicator */}
        {result && (
          <div className={`w-8 h-8 rounded-lg ${resultColors[result]} flex items-center justify-center text-xs font-bold`}>
            {result === 'win' ? 'V' : result === 'loss' ? 'D' : 'N'}
          </div>
        )}
        {!result && (
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs text-gray-400">
            —
          </div>
        )}

        {/* Match info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">
              vs {match.opponent?.short_name || match.opponent?.name || 'TBD'}
            </p>
            {isFinished && ourScore !== null && theirScore !== null && (
              <span className="text-xs font-mono text-gray-300">
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

        <svg className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

  const config = statusConfig[status] || { label: status, color: 'text-gray-400' };

  return <span className={config.color}>{config.label}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
