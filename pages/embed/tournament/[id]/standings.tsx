// pages/embed/tournament/[id]/standings.tsx
//
// Read-only, chrome-less standings view meant to be embedded in a third-party
// <iframe>. No Navbar / Footer / CookieBanner / Toast (suppressed in _app.tsx
// for the /embed/* scope). SSR loads the tournament + its final rankings using
// the SAME service-role reader as the public podium view
// (readPublicTournamentStandings), then projects ONLY public, non-PII fields
// (rank, team name/logo, prize) into props.
//
// CSP NOTE: this route must be allowed to be framed (frame-ancestors) — handled
// by the proxy/CSP owner, not here.

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveEmbedChrome } from '@/utils/embed';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import {
  readPublicTournamentStandings,
  type PublicStanding,
} from '@/utils/public/readStandings';
import EmbedStandings, {
  type EmbedTheme,
} from '@/components/embed/EmbedStandings';
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
  standings: PublicStanding[];
  theme: EmbedTheme;
  accent: string | null;
  publicUrl: string | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id) || !supabaseAdmin) {
    return { notFound: true };
  }

  const { tenantId, theme, accent } = await resolveEmbedChrome(ctx.query);

  // 1) Tournament (UUID or slug) — same lookup as the public views.
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

  // 2) Final standings — reader projects only public, non-PII columns.
  let standings: PublicStanding[] = [];
  try {
    standings = await readPublicTournamentStandings(tournament.id, tenantId);
  } catch (err) {
    logger.error('embed standings error:', err);
  }

  const publicSlug = tournament.slug || tournament.id;
  const publicUrl = `/tournament/${publicSlug}/podium`;

  return {
    props: {
      tournamentName: tournament.name,
      standings,
      theme,
      accent,
      publicUrl,
    },
  };
};

export default function EmbedTournamentStandingsPage({
  tournamentName,
  standings,
  theme,
  accent,
  publicUrl,
}: Props) {
  return (
    <>
      <Head>
        <title>Classement – {tournamentName}</title>
        <meta name="robots" content="noindex" />
        <meta
          name="color-scheme"
          content={theme === 'light' ? 'light' : 'dark'}
        />
      </Head>
      <EmbedStandings
        tournamentName={tournamentName}
        standings={standings}
        theme={theme}
        accent={accent}
        publicUrl={publicUrl}
      />
    </>
  );
}
