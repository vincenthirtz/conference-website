// pages/tournament/[id]/mvp.tsx
// Page publique : leaderboard MVP du tournoi (agregation des winners de match_mvp_polls).

import { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';

type LeaderboardEntry = {
  memberId: string | null;
  battleTag: string | null;
  teamId: string | null;
  teamName: string | null;
  mvpCount: number;
  matchIds: string[];
};

type PerMatchEntry = {
  matchId: string;
  roundName: string | null;
  completedAt: string | null;
  memberId: string | null;
  battleTag: string | null;
  teamId: string | null;
  teamName: string | null;
};

type Tournament = { id: string; name: string };

type Props = {
  tournament: Tournament;
  totalMvpAwards: number;
  totalFinishedMatches: number;
  leaderboard: LeaderboardEntry[];
  perMatch: PerMatchEntry[];
};

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) return { notFound: true, revalidate: 60 };
  if (!supabaseAdmin) return { notFound: true, revalidate: 60 };

  // Phase A : tournoi + matches en parallèle
  const [tournamentRes, matchesRes] = await Promise.all([
    supabaseAdmin
      .from('tournaments')
      .select('id, name, is_public')
      .eq('id', id)
      .maybeSingle(),
    supabaseAdmin
      .from('matches')
      .select(
        `
      id,
      round_name,
      completed_at,
      team1_id,
      team2_id,
      status,
      mvp:match_mvp_polls(winner_member_id, winner_battle_tag)
      `
      )
      .eq('tournament_id', id)
      .eq('status', 'finished')
      .order('completed_at', { ascending: false }),
  ]);

  const tournament = tournamentRes.data;
  if (!tournament || !tournament.is_public)
    return { notFound: true, revalidate: 60 };

  const finishedMatches = matchesRes.data || [];

  type EnrichedRow = {
    matchId: string;
    roundName: string | null;
    completedAt: string | null;
    team1Id: string | null;
    team2Id: string | null;
    memberId: string | null;
    battleTag: string | null;
  };

  const enriched: EnrichedRow[] = finishedMatches.map((m: any) => {
    const poll = Array.isArray(m.mvp) ? (m.mvp[0] ?? null) : (m.mvp ?? null);
    return {
      matchId: m.id,
      roundName: m.round_name ?? null,
      completedAt: m.completed_at ?? null,
      team1Id: m.team1_id ?? null,
      team2Id: m.team2_id ?? null,
      memberId: poll?.winner_member_id ?? null,
      battleTag: poll?.winner_battle_tag ?? null,
    };
  });

  // Resoudre team_id par memberId
  const memberIds = Array.from(
    new Set(enriched.map((e) => e.memberId).filter((x): x is string => !!x))
  );
  const memberToTeam = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: members } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id')
      .in('id', memberIds);
    for (const m of members || []) memberToTeam.set(m.id, m.team_id);
  }

  // Noms des equipes
  const teamIds = Array.from(
    new Set(
      [
        ...Array.from(memberToTeam.values()),
        ...enriched.flatMap((e) =>
          [e.team1Id, e.team2Id].filter((x): x is string => !!x)
        ),
      ].filter(Boolean)
    )
  );
  const teamNameMap = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .in('id', teamIds);
    for (const t of teams || []) teamNameMap.set(t.id, t.name);
  }

  const perMatch: PerMatchEntry[] = enriched.map((e) => {
    const teamId = e.memberId ? (memberToTeam.get(e.memberId) ?? null) : null;
    return {
      matchId: e.matchId,
      roundName: e.roundName,
      completedAt: e.completedAt,
      memberId: e.memberId,
      battleTag: e.battleTag,
      teamId,
      teamName: teamId ? (teamNameMap.get(teamId) ?? null) : null,
    };
  });

  // Leaderboard agrege par memberId (fallback bt:battleTag)
  type LbAcc = LeaderboardEntry;
  const lbMap = new Map<string, LbAcc>();
  for (const e of perMatch) {
    if (!e.memberId && !e.battleTag) continue;
    const key = e.memberId || `bt:${e.battleTag}`;
    const cur = lbMap.get(key);
    if (cur) {
      cur.mvpCount += 1;
      cur.matchIds.push(e.matchId);
    } else {
      lbMap.set(key, {
        memberId: e.memberId,
        battleTag: e.battleTag,
        teamId: e.teamId,
        teamName: e.teamName,
        mvpCount: 1,
        matchIds: [e.matchId],
      });
    }
  }
  const leaderboard = Array.from(lbMap.values()).sort((a, b) => {
    if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
    return (a.battleTag || '').localeCompare(b.battleTag || '');
  });

  return {
    props: {
      tournament: { id: tournament.id, name: tournament.name },
      totalMvpAwards: leaderboard.reduce((sum, l) => sum + l.mvpCount, 0),
      totalFinishedMatches: finishedMatches.length,
      leaderboard,
      perMatch,
    },
    revalidate: 60,
  };
};

function rankColor(rank: number): string {
  if (rank === 1)
    return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
  if (rank === 2) return 'bg-gray-400/20 text-gray-200 border-gray-400/40';
  if (rank === 3)
    return 'bg-orange-700/20 text-orange-300 border-orange-700/40';
  return 'bg-white/5 text-gray-300 border-white/10';
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function TournamentMvpPage({
  tournament,
  totalMvpAwards,
  totalFinishedMatches,
  leaderboard,
  perMatch,
}: Props) {
  const matchesWithMvp = perMatch.filter((m) => m.battleTag || m.memberId);

  return (
    <>
      <Head>
        <title>{tournament.name} · MVP du tournoi</title>
        <meta
          name="description"
          content={`Classement des MVP du tournoi ${tournament.name}`}
        />
      </Head>

      <main className="bg-neutral-950 text-white min-h-screen pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4">
          <section className="mb-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                  Tournoi · MVP
                </p>
                <Heading
                  level="h1"
                  typeStyle="heading-md"
                  className="text-gradient mb-2"
                >
                  MVP du tournoi
                </Heading>
                <p className="text-sm text-gray-300">{tournament.name}</p>
                <Paragraph
                  typeStyle="body-sm"
                  textColor="text-gray-200"
                  className="max-w-xl mt-2"
                >
                  Classement des joueuses élues MVP par sondage Discord après
                  chaque match. {totalMvpAwards} MVP attribué(s) sur{' '}
                  {totalFinishedMatches} match(s) terminé(s).
                </Paragraph>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Link href={`/tournament/${tournament.id}`}>
                  <Button
                    type="button"
                    className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
                  >
                    ← Retour au tournoi
                  </Button>
                </Link>
                <Link href={`/tournament/${tournament.id}/stats`}>
                  <Button
                    type="button"
                    className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
                  >
                    Stats équipes
                  </Button>
                </Link>
                <Link href={`/tournament/${tournament.id}/matches`}>
                  <Button
                    type="button"
                    className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-pink-400"
                  >
                    Tous les matchs
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {leaderboard.length === 0 ? (
            <section className="bg-black/60 border border-white/5 rounded-2xl p-8 text-center">
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                Aucun MVP n&apos;a encore été désigné sur ce tournoi. Les MVP
                sont importés manuellement par le staff après le sondage
                Discord.
              </Paragraph>
            </section>
          ) : (
            <>
              <section className="mb-8">
                <div className="bg-black/60 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-[0.16em] text-gray-400 border-b border-white/5">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">Joueur</div>
                    <div className="col-span-4">Équipe</div>
                    <div className="col-span-2 text-right">MVP</div>
                  </div>
                  {leaderboard.map((entry, idx) => (
                    <div
                      key={entry.memberId || `bt:${entry.battleTag}`}
                      className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-white/5 last:border-b-0 hover:bg-white/5"
                    >
                      <div className="col-span-1">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${rankColor(idx + 1)}`}
                        >
                          {idx + 1}
                        </span>
                      </div>
                      <div className="col-span-5">
                        <p className="text-sm font-semibold truncate">
                          {entry.battleTag || 'Joueur inconnu'}
                        </p>
                      </div>
                      <div className="col-span-4 text-sm text-gray-300 truncate">
                        {entry.teamName || '—'}
                      </div>
                      <div className="col-span-2 text-right font-mono text-lg font-semibold">
                        {entry.mvpCount}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {matchesWithMvp.length > 0 && (
                <section>
                  <Heading level="h2" typeStyle="heading-md" className="mb-3">
                    MVP par match
                  </Heading>
                  <div className="bg-black/60 border border-white/5 rounded-2xl overflow-hidden">
                    {matchesWithMvp.map((m) => (
                      <Link
                        key={m.matchId}
                        href={`/match/${m.matchId}`}
                        className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-white/5 last:border-b-0 hover:bg-white/5"
                      >
                        <div className="col-span-3 text-xs text-gray-400">
                          {formatDate(m.completedAt)}
                        </div>
                        <div className="col-span-3 text-sm text-gray-300 truncate">
                          {m.roundName || '—'}
                        </div>
                        <div className="col-span-3 text-sm font-medium text-purple-200 truncate">
                          {m.battleTag || '—'}
                        </div>
                        <div className="col-span-3 text-sm text-gray-300 truncate text-right">
                          {m.teamName || '—'}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
