// pages/match/[id]/games.tsx

import { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import type { MatchStatus } from '@/types/admin';
import { useT, format } from '@/lib/i18n/useT';

import { logger } from '../../../utils/logger';

type MatchGamesDict = ReturnType<typeof useT<'matchGames'>>;
type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
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
  created_at: string;
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
  group_key: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  team1_score: number | null;
  team2_score: number | null;
  team1: SimpleTeam | null;
  team2: SimpleTeam | null;
  tournament: Tournament;
  stage: Stage | null;
  games: Game[];
};

type Props = {
  match: Match | null;
};

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
      group_key,
      scheduled_at,
      completed_at,
      team1_score,
      team2_score,
      team1:team1_id ( id, name, short_name, logo_url ),
      team2:team2_id ( id, name, short_name, logo_url ),
      tournament:tournament_id ( id, slug, name, short_name, game ),
      stage:stage_id ( id, name, stage_type ),
      games (*)
    `
    )
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();

  if (error || !data) {
    logger.error('match games page error:', error);
    return { notFound: true, revalidate: 60 };
  }

  const match = data as any as Match;

  match.games =
    match.games?.slice().sort((a: Game, b: Game) => {
      const oa = a.map_order ?? 0;
      const ob = b.map_order ?? 0;
      return oa - ob;
    }) ?? [];

  return {
    props: {
      match,
    },
    revalidate: 30,
  };
};

export default function MatchGamesPage({ match }: Props) {
  const t = useT('matchGames');
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

  const t1Name = t1?.short_name || t1?.name || t.team1Fallback;
  const t2Name =
    t2?.short_name || t2?.name || (isBye ? t.byeLabel : t.team2Fallback);

  const statusLabel = getMatchStatusLabel(t, match.status);
  const statusChipClass = getMatchStatusChipClass(match.status);
  const formatLabel = match.match_format?.toUpperCase() || 'BO?';

  const roundsSummary = computeRoundsSummary(match.games);
  const tournamentPath = `/tournament/${match.tournament.slug || match.tournament.id}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>
          {format(t.docTitle, {
            team1: t1Name,
            team2: t2Name,
            tournament: match.tournament.name,
          })}
        </title>
      </Head>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">
        {/* Header */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-3 text-[10px] uppercase tracking-wide">
                <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] text-white font-semibold">
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

              <Heading typeStyle="heading-md" className="mb-1 text-brand-gradient">
                {t.detailHeading} – {t1Name}{' '}
                {!isBye && <span className="text-gray-400">{t.vs}</span>}{' '}
                {t2Name}
              </Heading>
              <span className="brand-rule mb-2 block" aria-hidden />

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-300 mb-1">
                <Link
                  href={tournamentPath}
                  className="hover:text-white"
                >
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
                    <span>{format(t.poule, { key: match.group_key })}</span>
                  </>
                )}
              </div>

              <Paragraph
                typeStyle="body-sm"
                textColor="text-gray-200"
                className="max-w-xl"
              >
                {t.intro}
              </Paragraph>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Link href={`/match/${match.id}`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-[var(--color-violet)] focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] focus-visible:outline-none"
                >
                  {t.backToSummary}
                </Button>
              </Link>
              <Link href={tournamentPath}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-[var(--color-green)] focus-visible:ring-2 focus-visible:ring-[var(--color-green)] focus-visible:outline-none"
                >
                  {t.tournament}
                </Button>
              </Link>
              <Link href={`${tournamentPath}/maps`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-[var(--color-yellow)] focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] focus-visible:outline-none"
                >
                  {t.topMaps}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Résumé rounds */}
        <section className="mb-6">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {match.games.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.noMapsYet}
              </Paragraph>
            )}

            {match.games.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label={t.statMapsPlayed}
                  value={match.games.length}
                />
                <StatCard
                  label={format(t.statRoundsTeam, { team: t1Name })}
                  value={roundsSummary.team1Rounds}
                />
                <StatCard
                  label={format(t.statRoundsTeam, { team: t2Name })}
                  value={roundsSummary.team2Rounds}
                />
                <StatCard
                  label={t.statRoundsDiff}
                  value={
                    roundsSummary.diff > 0
                      ? `+${roundsSummary.diff}`
                      : roundsSummary.diff.toString()
                  }
                  hint={
                    roundsSummary.diff > 0
                      ? t1Name
                      : roundsSummary.diff < 0
                        ? t2Name
                        : t.balanced
                  }
                />
              </div>
            )}
          </div>
        </section>

        {/* Liste des games */}
        {match.games.length > 0 && (
          <section>
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">
                  {t.mapsOfMatch}
                </p>
                <span className="text-[10px] text-gray-500">
                  {format(
                    match.games.length > 1
                      ? t.mapsRecorded_other
                      : t.mapsRecorded_one,
                    { count: match.games.length }
                  )}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th scope="col" className="text-left py-1.5 pr-3">#</th>
                      <th scope="col" className="text-left py-1.5 pr-3">{t.colMap}</th>
                      <th scope="col" className="text-right py-1.5 px-3">{t1Name}</th>
                      <th scope="col" className="text-right py-1.5 px-3">{t2Name}</th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colTotalRounds}
                      </th>
                      <th scope="col" className="text-right py-1.5 pl-3">{t.colTags}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {match.games.map((g, idx) => {
                      const order =
                        typeof g.map_order === 'number'
                          ? g.map_order + 1
                          : idx + 1;
                      const s1 = g.team1_score ?? 0;
                      const s2 = g.team2_score ?? 0;
                      const total = s1 + s2;
                      const tags: { id: string; label: string; cls: string }[] =
                        [];
                      if (g.is_tiebreaker)
                        tags.push({
                          id: 'tiebreaker',
                          label: t.tagTiebreaker,
                          cls: ' bg-fuchsia-500/20 border-fuchsia-400/70 text-fuchsia-100',
                        });
                      if (g.went_overtime)
                        tags.push({
                          id: 'overtime',
                          label: t.tagOvertime,
                          cls: ' bg-amber-500/20 border-amber-400/70 text-amber-100',
                        });

                      return (
                        <tr
                          key={g.id}
                          className={
                            'border-b border-white/5' +
                            (idx % 2 === 0 ? ' bg-white/0' : ' bg-white/[0.02]')
                          }
                        >
                          <td className="py-1.5 pr-3 text-gray-400">{order}</td>
                          <td className="py-1.5 pr-3 text-gray-100">
                            {g.map_name || format(t.mapFallback, { order })}
                          </td>
                          <td className="py-1.5 px-3 text-right text-gray-100">
                            {s1}
                          </td>
                          <td className="py-1.5 px-3 text-right text-gray-100">
                            {s2}
                          </td>
                          <td className="py-1.5 px-3 text-right text-gray-100">
                            {total}
                          </td>
                          <td className="py-1.5 pl-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              {tags.length === 0 && (
                                <span className="text-[10px] text-gray-500">
                                  —
                                </span>
                              )}
                              {tags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className={
                                    'px-1.5 py-[1px] rounded-full border text-[9px]' +
                                    tag.cls
                                  }
                                >
                                  {tag.label}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[10px] text-gray-500">{t.scoresHint}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Utils & petits composants
 * ────────────────────────────────────────────*/

function computeRoundsSummary(games: Game[]) {
  let team1Rounds = 0;
  let team2Rounds = 0;

  for (const g of games) {
    team1Rounds += g.team1_score ?? 0;
    team2Rounds += g.team2_score ?? 0;
  }

  return {
    team1Rounds,
    team2Rounds,
    diff: team1Rounds - team2Rounds,
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/8 via-white/5 to-white/0 border border-white/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </p>
      <p className="text-xl font-semibold text-white">
        {typeof value === 'number' ? value.toString() : value}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-[2px]">{hint}</p>}
    </div>
  );
}

function getMatchStatusLabel(
  t: MatchGamesDict,
  status: MatchStatus
): string {
  switch (status) {
    case 'pending':
      return t.statusUpcoming;
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
