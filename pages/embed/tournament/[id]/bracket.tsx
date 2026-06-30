// pages/embed/tournament/[id]/bracket.tsx
//
// T7 — Read-only, chrome-less bracket view meant to be embedded in a third-party
// <iframe>. No Navbar / Footer / CookieBanner / Toast (suppressed in _app.tsx
// for the /embed/* scope). SSR loads the tournament + its bracket matches using
// the SAME service-role data path as the public matches view
// (findTournamentByIdOrSlug + supabaseAdmin), then projects ONLY public,
// non-PII fields (team names/logos, scores, rounds, schedule) into props.
//
// CSP NOTE: this route must be allowed to be framed (frame-ancestors) — handled
// by the proxy/CSP owner, not here.

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import EmbedBracket, { type EmbedTheme } from '@/components/embed/EmbedBracket';
import type {
  BracketRound,
  ScheduleMatch,
} from '@/components/admin/bracket/types';
import { logger } from '@/utils/logger';

type TournamentLite = {
  id: string;
  slug: string | null;
  name: string;
  visibility: string | null;
  status: string | null;
};

type Props = {
  tournamentName: string;
  rounds: BracketRound[];
  loserRounds: BracketRound[];
  isDoubleElim: boolean;
  theme: EmbedTheme;
  publicUrl: string | null;
};

/** Group a flat list of bracket matches into ordered rounds. */
function buildRounds(matches: ScheduleMatch[]): BracketRound[] {
  const roundMap = new Map<number, ScheduleMatch[]>();
  for (const m of matches) {
    const r = m.round_number ?? 0;
    if (!roundMap.has(r)) roundMap.set(r, []);
    roundMap.get(r)!.push(m);
  }
  return Array.from(roundMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNum, roundMatches]) => ({
      roundNumber: roundNum,
      roundName:
        roundMatches[0]?.round_name ??
        (roundMatches.length === 1 ? 'Finale' : `Round ${roundNum}`),
      matches: roundMatches.sort(
        (a, b) => (a.position_in_round ?? 0) - (b.position_in_round ?? 0)
      ),
    }));
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id) || !supabaseAdmin) {
    return { notFound: true };
  }

  const themeParam = ctx.query.theme;
  const theme: EmbedTheme =
    (Array.isArray(themeParam) ? themeParam[0] : themeParam) === 'light'
      ? 'light'
      : 'dark';

  const tenantId = DEFAULT_TENANT_ID;

  // 1) Tournament (UUID or slug) — same lookup as the public matches view.
  const tournament = await findTournamentByIdOrSlug<TournamentLite>(
    id,
    'id, slug, name, visibility, status',
    tenantId
  );
  if (!tournament) {
    return { notFound: true };
  }
  // Only public tournaments are embeddable. Private/hidden → clean 404.
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true };
  }

  // 2) Bracket matches — project ONLY public, non-PII columns. No emails, no
  //    account/staff data, no notes free-text beyond what the renderer needs.
  const { data: matchesData, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      stage_id,
      round_number,
      round_name,
      position_in_round,
      status,
      match_format,
      best_of,
      scheduled_at,
      team1_id,
      team2_id,
      winner_team_id,
      notes,
      bracket_side,
      team1:team1_id ( id, name, short_name, logo_url ),
      team2:team2_id ( id, name, short_name, logo_url )
    `
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournament.id)
    .neq('status', 'cancelled')
    .order('round_number', { ascending: true })
    .order('position_in_round', { ascending: true });

  if (mErr) {
    logger.error('embed bracket matches error:', mErr);
  }

  const matches = (matchesData || []) as unknown as ScheduleMatch[];

  const isDoubleElim = matches.some((m) => m.bracket_side === 'lb');

  const mainMatches = isDoubleElim
    ? matches.filter(
        (m) => m.bracket_side === 'wb' || m.bracket_side === 'final'
      )
    : matches;
  const lbMatches = isDoubleElim
    ? matches.filter((m) => m.bracket_side === 'lb')
    : [];

  const rounds = buildRounds(mainMatches);
  const loserRounds = buildRounds(lbMatches);

  const publicSlug = tournament.slug || tournament.id;
  const publicUrl = `/tournament/${publicSlug}/bracket`;

  return {
    props: {
      tournamentName: tournament.name,
      rounds,
      loserRounds,
      isDoubleElim,
      theme,
      publicUrl,
    },
  };
};

export default function EmbedTournamentBracketPage({
  tournamentName,
  rounds,
  loserRounds,
  isDoubleElim,
  theme,
  publicUrl,
}: Props) {
  return (
    <>
      <Head>
        <title>Bracket – {tournamentName}</title>
        <meta name="robots" content="noindex" />
        <meta
          name="color-scheme"
          content={theme === 'light' ? 'light' : 'dark'}
        />
      </Head>
      <EmbedBracket
        tournamentName={tournamentName}
        rounds={rounds}
        loserRounds={loserRounds}
        isDoubleElim={isDoubleElim}
        theme={theme}
        publicUrl={publicUrl}
      />
    </>
  );
}
