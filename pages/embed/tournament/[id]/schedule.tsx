// pages/embed/tournament/[id]/schedule.tsx
//
// Read-only, chrome-less match schedule meant to be embedded in a third-party
// <iframe>. No Navbar / Footer / CookieBanner / Toast (suppressed in _app.tsx
// for the /embed/* scope). SSR loads the tournament + its public matches using
// the SAME service-role reader as the public matches API
// (readPublicTournamentMatches), then projects ONLY public, non-PII fields
// (team names, scores, status, schedule) into props.
//
// CSP NOTE: this route must be allowed to be framed (frame-ancestors) — handled
// by the proxy/CSP owner, not here.

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import {
  readPublicTournamentMatches,
  type PublicMatch,
} from '@/utils/public/readMatches';
import EmbedSchedule, {
  type EmbedTheme,
} from '@/components/embed/EmbedSchedule';
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
  matches: PublicMatch[];
  theme: EmbedTheme;
  publicUrl: string | null;
};

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

  // 2) Public matches — reader projects only public, non-PII columns and
  //    filters to publicly visible statuses (never cancelled). Ordered by
  //    scheduled_at asc.
  let matches: PublicMatch[] = [];
  try {
    matches = await readPublicTournamentMatches(tournament.id, tenantId, {});
  } catch (err) {
    logger.error('embed schedule error:', err);
  }

  const publicSlug = tournament.slug || tournament.id;
  const publicUrl = `/tournament/${publicSlug}/matches`;

  return {
    props: {
      tournamentName: tournament.name,
      matches,
      theme,
      publicUrl,
    },
  };
};

export default function EmbedTournamentSchedulePage({
  tournamentName,
  matches,
  theme,
  publicUrl,
}: Props) {
  return (
    <>
      <Head>
        <title>Calendrier – {tournamentName}</title>
        <meta name="robots" content="noindex" />
        <meta
          name="color-scheme"
          content={theme === 'light' ? 'light' : 'dark'}
        />
      </Head>
      <EmbedSchedule
        tournamentName={tournamentName}
        matches={matches}
        theme={theme}
        publicUrl={publicUrl}
      />
    </>
  );
}
