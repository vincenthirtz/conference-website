// pages/embed/tournament/[id]/ffa.tsx
//
// Read-only, chrome-less FFA standings view meant to be embedded in a
// third-party <iframe>. No Navbar / Footer / CookieBanner / Toast (suppressed
// in _app.tsx for the /embed/* scope). SSR loads the tournament + its FFA stage
// standings using the SAME service-role reader as the public FFA page
// (readPublicFfaStandings), then projects ONLY public, non-PII fields into props.
//
// CSP NOTE: this route must be allowed to be framed (frame-ancestors) — handled
// by the proxy/CSP owner, not here.

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import {
  readPublicFfaStandings,
  type PublicFfaStandingRow,
} from '@/utils/public/readFfaStandings';
import EmbedFfaStandings, {
  type EmbedTheme,
} from '@/components/embed/EmbedFfaStandings';
import { logger } from '@/utils/logger';

type TournamentLite = {
  id: string;
  slug: string | null;
  name: string;
  visibility: string | null;
};

type Props = {
  tournamentName: string;
  stageName: string | null;
  standings: PublicFfaStandingRow[];
  theme: EmbedTheme;
  publicUrl: string | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) {
    return { notFound: true };
  }

  const themeParam = ctx.query.theme;
  const theme: EmbedTheme =
    (Array.isArray(themeParam) ? themeParam[0] : themeParam) === 'light'
      ? 'light'
      : 'dark';

  const tenantId = DEFAULT_TENANT_ID;

  const tournament = await findTournamentByIdOrSlug<TournamentLite>(
    id,
    'id, slug, name, visibility',
    tenantId
  );
  if (!tournament) {
    return { notFound: true };
  }
  // Only public tournaments are embeddable. Private/hidden → clean 404.
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true };
  }

  let stageName: string | null = null;
  let standings: PublicFfaStandingRow[] = [];
  try {
    const result = await readPublicFfaStandings(tournament.id, tenantId);
    if (result) {
      stageName = result.stageName;
      standings = result.standings;
    }
  } catch (err) {
    logger.error('embed ffa standings error:', err);
  }

  const publicSlug = tournament.slug || tournament.id;
  const publicUrl = `/tournament/${publicSlug}/ffa`;

  return {
    props: {
      tournamentName: tournament.name,
      stageName,
      standings,
      theme,
      publicUrl,
    },
  };
};

export default function EmbedTournamentFfaPage({
  tournamentName,
  stageName,
  standings,
  theme,
  publicUrl,
}: Props) {
  return (
    <>
      <Head>
        <title>FFA – {tournamentName}</title>
        <meta name="robots" content="noindex" />
        <meta
          name="color-scheme"
          content={theme === 'light' ? 'light' : 'dark'}
        />
      </Head>
      <EmbedFfaStandings
        tournamentName={tournamentName}
        stageName={stageName}
        standings={standings}
        theme={theme}
        publicUrl={publicUrl}
      />
    </>
  );
}
