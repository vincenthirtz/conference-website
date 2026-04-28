// pages/tournament/[id]/teams/[teamId].tsx
// Page publique : fiche d'une equipe au sein d'un tournoi specifique.
// Affiche le roster, les stats du tournoi, les matchs (passes + a venir)
// et les MVPs eventuels gagnes par les joueuses de l'equipe.

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';

type Tournament = {
  id: string;
  name: string;
  game: string | null;
  start_date: string | null;
  end_date: string | null;
};

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  banner_url: string | null;
  country: string | null;
  description: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  captain_id: string | null;
};

type RosterMember = {
  id: string;
  battle_tag: string | null;
  role: string;
  is_substitute: boolean;
  is_captain: boolean;
  mvpCount: number;
};

type TournamentMatch = {
  id: string;
  status: string;
  round_name: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  opponent: {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
  } | null;
  isTeam1: boolean;
};

type Props = {
  tournament: Tournament;
  team: Team;
  roster: RosterMember[];
  matches: TournamentMatch[];
  stats: { played: number; wins: number; losses: number; draws: number };
  totalMvpAwards: number;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  const teamId = ctx.params?.teamId;
  if (!id || Array.isArray(id)) return { notFound: true };
  if (!teamId || Array.isArray(teamId)) return { notFound: true };
  if (!supabaseAdmin) return { notFound: true };

  // 1) Tournament (verifier visibilite)
  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, game, start_date, end_date, is_public')
    .eq('id', id)
    .maybeSingle();
  if (!tournament || !tournament.is_public) return { notFound: true };

  // 2) Team
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select(
      'id, name, short_name, logo_url, banner_url, country, description, twitter, discord, website, captain_id, is_active'
    )
    .eq('id', teamId)
    .maybeSingle();
  if (!team || team.is_active === false) return { notFound: true };

  // 3) Verifier que la team est bien inscrite a ce tournoi
  const { data: registration } = await supabaseAdmin
    .from('tournament_teams')
    .select('team_id')
    .eq('tournament_id', id)
    .eq('team_id', teamId)
    .maybeSingle();
  if (!registration) return { notFound: true };

  // 4) Roster (sans donnees sensibles)
  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id, battle_tag, role, is_substitute, user_id, created_at')
    .eq('team_id', teamId)
    .order('is_substitute', { ascending: true })
    .order('created_at', { ascending: true });

  // 5) Matchs du tournoi pour cette team
  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, round_name, scheduled_at, completed_at,
      team1_id, team2_id, team1_score, team2_score, winner_team_id,
      mvp:match_mvp_polls(winner_member_id)
      `
    )
    .eq('tournament_id', id)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  const matches = matchesData || [];

  // 6) Adversaires
  const opponentIds = new Set<string>();
  for (const m of matches) {
    const opp = m.team1_id === teamId ? m.team2_id : m.team1_id;
    if (opp) opponentIds.add(opp);
  }
  const { data: opponentTeams } =
    opponentIds.size > 0
      ? await supabaseAdmin
          .from('teams')
          .select('id, name, short_name, logo_url')
          .in('id', Array.from(opponentIds))
      : { data: [] };
  const oppMap = new Map((opponentTeams || []).map((t: any) => [t.id, t]));

  // 7) Stats W/L/D pour ce tournoi (matchs finis uniquement, hors bye)
  let wins = 0,
    losses = 0,
    draws = 0,
    played = 0;
  for (const m of matches) {
    if (m.status !== 'finished' && m.status !== 'walkover') continue;
    if (!m.winner_team_id && (m.team1_score === null || m.team2_score === null))
      continue;
    played += 1;
    if (m.winner_team_id === teamId) wins += 1;
    else if (m.winner_team_id) losses += 1;
    else draws += 1;
  }

  // 8) Compter MVPs gagnes par chaque membre du roster sur ce tournoi
  const memberIdSet = new Set((members || []).map((m: any) => m.id));
  const mvpCountByMember = new Map<string, number>();
  for (const m of matches) {
    const mvp = Array.isArray(m.mvp) ? m.mvp[0] : m.mvp;
    const winnerMemberId = mvp?.winner_member_id;
    if (winnerMemberId && memberIdSet.has(winnerMemberId)) {
      mvpCountByMember.set(
        winnerMemberId,
        (mvpCountByMember.get(winnerMemberId) ?? 0) + 1
      );
    }
  }
  const totalMvpAwards = Array.from(mvpCountByMember.values()).reduce(
    (a, b) => a + b,
    0
  );

  // 9) Construire le roster final
  const roster: RosterMember[] = (members || []).map((m: any) => ({
    id: m.id,
    battle_tag: m.battle_tag ?? null,
    role: m.role,
    is_substitute: !!m.is_substitute,
    is_captain: m.user_id === team.captain_id,
    mvpCount: mvpCountByMember.get(m.id) ?? 0,
  }));

  // 10) Construire les matchs avec opponent
  const tournamentMatches: TournamentMatch[] = matches.map((m: any) => {
    const isTeam1 = m.team1_id === teamId;
    const opponentId = isTeam1 ? m.team2_id : m.team1_id;
    const opponent = opponentId ? (oppMap.get(opponentId) ?? null) : null;
    return {
      id: m.id,
      status: m.status,
      round_name: m.round_name ?? null,
      scheduled_at: m.scheduled_at ?? null,
      completed_at: m.completed_at ?? null,
      team1_id: m.team1_id,
      team2_id: m.team2_id,
      team1_score: m.team1_score,
      team2_score: m.team2_score,
      winner_team_id: m.winner_team_id,
      opponent: opponent
        ? {
            id: opponent.id,
            name: opponent.name,
            short_name: opponent.short_name ?? null,
            logo_url: opponent.logo_url ?? null,
          }
        : null,
      isTeam1,
    };
  });

  return {
    props: {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        game: tournament.game ?? null,
        start_date: tournament.start_date ?? null,
        end_date: tournament.end_date ?? null,
      },
      team: {
        id: team.id,
        name: team.name,
        short_name: team.short_name ?? null,
        logo_url: team.logo_url ?? null,
        banner_url: team.banner_url ?? null,
        country: team.country ?? null,
        description: team.description ?? null,
        twitter: team.twitter ?? null,
        discord: team.discord ?? null,
        website: team.website ?? null,
        captain_id: team.captain_id ?? null,
      },
      roster,
      matches: tournamentMatches,
      stats: { played, wins, losses, draws },
      totalMvpAwards,
    },
  };
};

function formatDate(iso: string | null) {
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

function matchOutcome(m: TournamentMatch, teamId: string) {
  if (m.status !== 'finished' && m.status !== 'walkover') {
    if (m.status === 'ongoing')
      return { label: 'En cours', color: 'text-amber-300' };
    return { label: 'À venir', color: 'text-neutral-400' };
  }
  if (m.winner_team_id === teamId)
    return { label: 'Victoire', color: 'text-emerald-300' };
  if (m.winner_team_id) return { label: 'Défaite', color: 'text-red-300' };
  return { label: 'Nul', color: 'text-neutral-400' };
}

export default function TournamentTeamPage({
  tournament,
  team,
  roster,
  matches,
  stats,
  totalMvpAwards,
}: Props) {
  const titulaires = roster.filter((m) => !m.is_substitute);
  const remplacants = roster.filter((m) => m.is_substitute);
  const winrate = stats.played > 0 ? (stats.wins / stats.played) * 100 : 0;

  return (
    <>
      <Head>
        <title>
          {team.name} · {tournament.name}
        </title>
        <meta
          name="description"
          content={`Roster, stats et résultats de ${team.name} sur le tournoi ${tournament.name}`}
        />
      </Head>

      <main className="bg-neutral-950 text-white min-h-screen pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4">
          {/* Header */}
          <section className="mb-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {team.logo_url && (
                <Image
                  src={team.logo_url}
                  alt={team.name}
                  width={80}
                  height={80}
                  className="rounded-xl object-cover bg-neutral-900 border border-white/10"
                />
              )}
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                  Tournoi · Équipe
                </p>
                <Heading
                  level="h1"
                  typeStyle="heading-md"
                  className="text-gradient mb-1"
                >
                  {team.name}
                </Heading>
                <p className="text-sm text-gray-300">
                  <Link
                    href={`/tournament/${tournament.id}`}
                    className="text-purple-300 hover:text-purple-200 underline"
                  >
                    {tournament.name}
                  </Link>
                  {team.country ? ` · ${team.country}` : ''}
                </p>
                {team.description && (
                  <Paragraph
                    typeStyle="body-sm"
                    textColor="text-gray-200"
                    className="max-w-xl mt-2"
                  >
                    {team.description}
                  </Paragraph>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/team/${team.id}`}>
                  <Button
                    type="button"
                    className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
                  >
                    Profil global
                  </Button>
                </Link>
                <Link href={`/tournament/${tournament.id}`}>
                  <Button
                    type="button"
                    className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
                  >
                    ← Tournoi
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {/* Stats du tournoi */}
          <section className="mb-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Matchs joués" value={stats.played} />
              <StatCard
                label="Victoires"
                value={stats.wins}
                accent="text-emerald-300"
              />
              <StatCard
                label="Défaites"
                value={stats.losses}
                accent="text-red-300"
              />
              <StatCard label="Winrate" value={`${winrate.toFixed(0)}%`} />
              <StatCard
                label="MVP"
                value={totalMvpAwards}
                accent="text-yellow-300"
              />
            </div>
          </section>

          {/* Roster */}
          <section className="mb-8">
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <h2 className="text-xs uppercase tracking-[0.16em] text-gray-400 mb-3">
                Roster ({roster.length})
              </h2>

              {titulaires.length === 0 && remplacants.length === 0 && (
                <p className="text-sm text-neutral-500">Aucun membre listé.</p>
              )}

              {titulaires.length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                    Titulaires
                  </p>
                  <ul className="space-y-1 mb-4">
                    {titulaires.map((m) => (
                      <RosterRow key={m.id} member={m} />
                    ))}
                  </ul>
                </>
              )}

              {remplacants.length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                    Remplaçants
                  </p>
                  <ul className="space-y-1">
                    {remplacants.map((m) => (
                      <RosterRow key={m.id} member={m} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          {/* Matches */}
          <section>
            <Heading level="h2" typeStyle="heading-md" className="mb-3">
              Matchs sur ce tournoi
            </Heading>

            {matches.length === 0 ? (
              <div className="bg-black/60 border border-white/5 rounded-2xl p-6 text-center">
                <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                  Aucun match programmé pour cette équipe sur ce tournoi.
                </Paragraph>
              </div>
            ) : (
              <div className="bg-black/60 border border-white/5 rounded-2xl overflow-hidden">
                {matches.map((m) => {
                  const outcome = matchOutcome(m, team.id);
                  const ourScore = m.isTeam1 ? m.team1_score : m.team2_score;
                  const theirScore = m.isTeam1 ? m.team2_score : m.team1_score;
                  return (
                    <Link
                      key={m.id}
                      href={`/match/${m.id}`}
                      className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-white/5 last:border-b-0 hover:bg-white/5"
                    >
                      <div className="col-span-3 text-xs text-gray-400">
                        {formatDate(m.scheduled_at || m.completed_at)}
                      </div>
                      <div className="col-span-3 text-xs text-gray-300 truncate">
                        {m.round_name || '—'}
                      </div>
                      <div className="col-span-3 flex items-center gap-2 truncate">
                        {m.opponent?.logo_url && (
                          <Image
                            src={m.opponent.logo_url}
                            alt=""
                            width={20}
                            height={20}
                            className="rounded object-cover"
                          />
                        )}
                        <span className="text-sm truncate">
                          {m.opponent?.name || '—'}
                        </span>
                      </div>
                      <div className="col-span-2 font-mono text-sm text-right">
                        {ourScore !== null && theirScore !== null
                          ? `${ourScore} - ${theirScore}`
                          : '—'}
                      </div>
                      <div
                        className={`col-span-1 text-xs text-right ${outcome.color}`}
                      >
                        {outcome.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="bg-black/60 border border-white/5 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${accent || 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function RosterRow({ member }: { member: RosterMember }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium truncate">
          {member.battle_tag || '— inconnu —'}
        </span>
        {member.is_captain && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-yellow-500/20 text-yellow-300 border-yellow-500/40">
            CAPITAINE
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        {member.mvpCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-300">
            <span>🏆</span>
            <span className="font-mono">{member.mvpCount}</span>
          </span>
        )}
        <span className="text-neutral-500">{member.role}</span>
      </div>
    </li>
  );
}
