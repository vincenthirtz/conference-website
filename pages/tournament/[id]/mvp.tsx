// pages/tournament/[id]/mvp.tsx
// Page publique : leaderboard MVP du tournoi (agregation des winners de match_mvp_polls).

import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { maskBattleTag } from '@/utils/battleTag';
import {
  resolveMissingDisplayNames,
  withFallbackDisplayName,
} from '@/utils/teams/memberDisplayName';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import nsTournamentMvp from '@/lib/i18n/locales/fr/tournamentMvp';

type LeaderboardEntry = {
  memberId: string | null;
  userId: string | null;
  displayName: string | null;
  battleTag: string | null;
  teamId: string | null;
  teamName: string | null;
  teamSlug: string | null;
  mvpCount: number;
  matchIds: string[];
};

type PerMatchEntry = {
  matchId: string;
  roundName: string | null;
  completedAt: string | null;
  memberId: string | null;
  userId: string | null;
  displayName: string | null;
  battleTag: string | null;
  teamId: string | null;
  teamName: string | null;
  teamSlug: string | null;
};

type Tournament = {
  id: string;
  slug?: string | null;
  name: string;
  status: string;
  visibility?: string | null;
};

type Props = {
  tournament: Tournament;
  totalMvpAwards: number;
  totalFinishedMatches: number;
  leaderboard: LeaderboardEntry[];
  perMatch: PerMatchEntry[];
  hasFfaStage: boolean;
  seo: SeoProps;
};

// SEO par-entité : leaderboard MVP du tournoi. description bilingue.
function buildMvpSeo(name: string): SeoProps {
  return {
    title: { fr: `MVP – ${name}`, en: `MVP – ${name}` },
    description: {
      fr: `Classement des MVP du tournoi ${name} — OW Women's Cup : joueuses les plus élues MVP par match.`,
      en: `MVP leaderboard for the ${name} tournament — OW Women's Cup: players most voted MVP across matches.`,
    },
    type: 'website',
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) return { notFound: true, revalidate: 60 };
  if (!supabaseAdmin) return { notFound: true, revalidate: 60 };

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
  const tenantId = DEFAULT_TENANT_ID;

  // Phase A : tournoi (UUID ou slug)
  const tournament = await findTournamentByIdOrSlug<Tournament>(
    id,
    'id, name, slug, status, visibility',
    tenantId
  );
  if (
    !tournament ||
    (tournament.visibility != null && tournament.visibility !== 'public')
  )
    return { notFound: true, revalidate: 60 };
  const tournamentId = tournament.id;

  const stagesRes = await supabaseAdmin
    .from('tournament_stages')
    .select('stage_type')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
  const hasFfaStage = (stagesRes.data || []).some(
    (s: any) => s.stage_type === 'ffa'
  );

  const matchesRes = await supabaseAdmin
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
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('status', 'finished')
    .order('completed_at', { ascending: false });

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
      // Anonymat public : on masque l'ID numérique du BattleTag (après le « # »).
      battleTag: maskBattleTag(poll?.winner_battle_tag ?? null),
    };
  });

  // Resoudre team_id par memberId
  const memberIds = Array.from(
    new Set(enriched.map((e) => e.memberId).filter((x): x is string => !!x))
  );
  const memberToTeam = new Map<string, string>();
  // Identité de la joueuse : `user_id` ouvre le lien vers son profil public,
  // `display_name` (surcharge d'équipe, sinon pseudo de compte) donne un
  // libellé à celles qui n'ont pas de BattleTag renseigné.
  const memberToIdentity = new Map<
    string,
    { userId: string | null; displayName: string | null }
  >();
  if (memberIds.length > 0) {
    const { data: members } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id, user_id, display_name')
      .eq('tenant_id', tenantId)
      .in('id', memberIds);
    const rows = (members || []) as any[];
    const resolvedNames = await resolveMissingDisplayNames(rows);
    for (const m of rows) {
      memberToTeam.set(m.id, m.team_id);
      memberToIdentity.set(m.id, {
        userId: m.user_id ?? null,
        displayName: withFallbackDisplayName(m, resolvedNames),
      });
    }
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
  const teamSlugMap = new Map<string, string | null>();
  if (teamIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .in('id', teamIds);
    for (const t of teams || []) {
      teamNameMap.set(t.id, t.name);
      teamSlugMap.set(t.id, t.slug ?? null);
    }
  }

  const perMatch: PerMatchEntry[] = enriched.map((e) => {
    const teamId = e.memberId ? (memberToTeam.get(e.memberId) ?? null) : null;
    const identity = e.memberId ? memberToIdentity.get(e.memberId) : undefined;
    return {
      matchId: e.matchId,
      roundName: e.roundName,
      completedAt: e.completedAt,
      memberId: e.memberId,
      userId: identity?.userId ?? null,
      displayName: identity?.displayName ?? null,
      battleTag: e.battleTag,
      teamId,
      teamName: teamId ? (teamNameMap.get(teamId) ?? null) : null,
      teamSlug: teamId ? (teamSlugMap.get(teamId) ?? null) : null,
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
        userId: e.userId,
        displayName: e.displayName,
        battleTag: e.battleTag,
        teamId: e.teamId,
        teamName: e.teamName,
        teamSlug: e.teamSlug,
        mvpCount: 1,
        matchIds: [e.matchId],
      });
    }
  }
  const leaderboard = Array.from(lbMap.values()).sort((a, b) => {
    if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
    return entryLabel(a).localeCompare(entryLabel(b));
  });

  return {
    props: {
      tournament: {
        id: tournament.id,
        slug: tournament.slug ?? null,
        name: tournament.name,
        status: tournament.status,
      },
      totalMvpAwards: leaderboard.reduce((sum, l) => sum + l.mvpCount, 0),
      totalFinishedMatches: finishedMatches.length,
      leaderboard,
      perMatch,
      hasFfaStage,
      seo: buildMvpSeo(tournament.name),
    },
    revalidate: 60,
  };
};

/**
 * Libellé d'une MVP : BattleTag masqué en priorité (c'est l'identité en jeu),
 * repli sur le pseudo de compte pour celles qui n'en ont pas renseigné.
 */
function entryLabel(entry: {
  battleTag: string | null;
  displayName: string | null;
}): string {
  return entry.battleTag || entry.displayName || '';
}

function rankColor(rank: number): string {
  if (rank === 1)
    return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
  if (rank === 2) return 'bg-gray-400/20 text-gray-200 border-gray-400/40';
  if (rank === 3)
    return 'bg-orange-700/20 text-orange-300 border-orange-700/40';
  return 'bg-white/5 text-gray-300 border-white/10';
}

function formatDate(iso: string | null, locale: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(locale, {
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
  hasFfaStage,
}: Props) {
  const t = useT(nsTournamentMvp);
  const locale = useLocale();
  const matchesWithMvp = perMatch.filter((m) => m.battleTag || m.memberId);
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';

  return (
    <>
      <main className="bg-neutral-950 text-white min-h-screen pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4">
          <section className="mb-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-yellow)]/90">
                  {t.eyebrow}
                </p>
                <Heading
                  level="h1"
                  typeStyle="heading-md"
                  className="text-brand-gradient mb-2"
                >
                  {t.heading}
                </Heading>
                <span className="brand-rule mb-2" aria-hidden />
                <p className="text-sm text-gray-300">{tournament.name}</p>
                <Paragraph
                  typeStyle="body-sm"
                  textColor="text-gray-200"
                  className="max-w-xl mt-2"
                >
                  {format(t.intro, {
                    awards: totalMvpAwards,
                    matches: totalFinishedMatches,
                  })}
                </Paragraph>
              </div>
            </div>
          </section>

          <TournamentTabs
            tournamentPath={tournamentPath}
            active="mvp"
            showPodium={isCompleted}
            showFfa={hasFfaStage}
          />

          {leaderboard.length === 0 ? (
            <section className="bg-black/60 border border-white/5 rounded-2xl p-8 text-center">
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.empty}
              </Paragraph>
            </section>
          ) : (
            <>
              <section className="mb-8">
                <div className="bg-black/60 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-[0.16em] text-gray-400 border-b border-white/5">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">{t.colPlayer}</div>
                    <div className="col-span-4">{t.colTeam}</div>
                    <div className="col-span-2 text-right">{t.colMvp}</div>
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
                        {entry.userId ? (
                          <Link
                            href={`/player/${encodeURIComponent(entry.userId)}`}
                            className="text-sm font-semibold truncate block hover:text-[var(--color-violet-light)] hover:underline"
                          >
                            {entryLabel(entry) || t.unknownPlayer}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold truncate">
                            {entryLabel(entry) || t.unknownPlayer}
                          </p>
                        )}
                      </div>
                      <div className="col-span-4 text-sm text-gray-300 truncate">
                        {entry.teamName && entry.teamSlug ? (
                          <Link
                            href={`/team/${entry.teamSlug}`}
                            className="hover:text-white hover:underline"
                          >
                            {entry.teamName}
                          </Link>
                        ) : (
                          entry.teamName || '—'
                        )}
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
                    {t.perMatchHeading}
                  </Heading>
                  <div className="bg-black/60 border border-white/5 rounded-2xl overflow-hidden">
                    {/* Chaque cellule porte son propre lien : la ligne mène au
                        match, le nom au profil de la joueuse. Un lien imbriqué
                        dans un autre serait invalide — d'où la grille en div. */}
                    {matchesWithMvp.map((m) => (
                      <div
                        key={m.matchId}
                        className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-white/5 last:border-b-0 hover:bg-white/5"
                      >
                        <div className="col-span-3 text-xs text-gray-400">
                          {formatDate(m.completedAt, locale)}
                        </div>
                        <div className="col-span-3 text-sm text-gray-300 truncate">
                          <Link
                            href={`/match/${m.matchId}`}
                            className="hover:text-white hover:underline"
                          >
                            {m.roundName || t.viewMatch}
                          </Link>
                        </div>
                        <div className="col-span-3 text-sm font-medium text-[var(--color-violet-light)] truncate">
                          {m.userId ? (
                            <Link
                              href={`/player/${encodeURIComponent(m.userId)}`}
                              className="hover:underline"
                            >
                              {entryLabel(m) || t.unknownPlayer}
                            </Link>
                          ) : (
                            entryLabel(m) || '—'
                          )}
                        </div>
                        <div className="col-span-3 text-sm text-gray-300 truncate text-right">
                          {m.teamName && m.teamSlug ? (
                            <Link
                              href={`/team/${m.teamSlug}`}
                              className="hover:text-white hover:underline"
                            >
                              {m.teamName}
                            </Link>
                          ) : (
                            m.teamName || '—'
                          )}
                        </div>
                      </div>
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
