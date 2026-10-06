// pages/tournament/[id]/reviews.tsx
// Page publique : vidéos de la playlist YouTube « Reviews » du tournoi.
//
// ISR comme ses sœurs. La liste vient du flux RSS public de la playlist, lu
// CÔTÉ SERVEUR (utils/youtube/playlistFeed.ts) : le navigateur ne contacte
// YouTube qu'au clic sur « lire » (façade, cf. ReviewVideoCard). Pas de
// playlist configurée → 404 (l'onglet est d'ailleurs masqué).

import type { ReactNode } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import ReviewVideoCard from '@/components/tournament/reviews/ReviewVideoCard';
import nsTournamentReviews from '@/lib/i18n/locales/fr/tournamentReviews';
import { containsFfaStage } from '@/utils/stages/ffaStage';
import {
  bracketTabMode,
  type BracketTabMode,
} from '@/utils/stages/bracketStage';
import { readReviewsPlaylistId } from '@/utils/tournaments/reviewsPlaylist';
import {
  fetchPlaylistVideos,
  reviewsRevalidateSeconds,
  type ReviewVideo,
} from '@/utils/youtube/playlistFeed';
import { playlistPageUrl } from '@/utils/youtube/playlist';

type Tournament = {
  id: string;
  slug?: string | null;
  name: string;
  status: string;
  visibility?: string | null;
};

type Props = {
  tournament: { id: string; slug: string | null; name: string; status: string };
  playlistId: string;
  feedStatus: 'ok' | 'not_found' | 'error';
  videos: ReviewVideo[];
  hasFfaStage: boolean;
  bracketTab: BracketTabMode;
  seo: SeoProps;
};

/** Le flux RSS ne rend que les 15 premières vidéos de la playlist. */
const FEED_MAX_ITEMS = 15;

function buildReviewsSeo(name: string): SeoProps {
  return {
    title: { fr: `Reviews – ${name}`, en: `Reviews – ${name}` },
    description: {
      fr: `Reviews vidéo des matchs du tournoi ${name} — OW Women's Cup : analyses et points clés.`,
      en: `Video reviews of the ${name} tournament matches — OW Women's Cup: analysis and key moments.`,
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

  const [playlistId, stagesRes] = await Promise.all([
    readReviewsPlaylistId(tenantId, tournament.id),
    supabaseAdmin
      .from('tournament_stages')
      .select('stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id),
  ]);
  // Revalidation courte : une playlist ajoutée dans l'admin fait apparaître la
  // page en une minute, comme l'onglet sur les pages sœurs.
  if (!playlistId) return { notFound: true, revalidate: 60 };

  const feed = await fetchPlaylistVideos(playlistId);

  return {
    props: {
      tournament: {
        id: tournament.id,
        slug: tournament.slug ?? null,
        name: tournament.name,
        status: tournament.status,
      },
      playlistId,
      feedStatus: feed.status,
      videos: feed.status === 'ok' ? feed.videos : [],
      hasFfaStage: containsFfaStage(stagesRes.data),
      bracketTab: bracketTabMode(stagesRes.data),
      seo: buildReviewsSeo(tournament.name),
    },
    revalidate: reviewsRevalidateSeconds(feed.status),
  };
};

export default function TournamentReviewsPage({
  tournament,
  playlistId,
  feedStatus,
  videos,
  hasFfaStage,
  bracketTab,
}: Props) {
  const t = useT(nsTournamentReviews);
  const locale = useLocale();
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';
  const playlistHref = playlistPageUrl(playlistId);

  let body: ReactNode;
  if (feedStatus !== 'ok' || videos.length === 0) {
    const message =
      feedStatus === 'not_found'
        ? t.notFound
        : feedStatus === 'error'
          ? t.error
          : t.empty;
    body = (
      <section
        className="rounded-2xl border border-white/5 bg-black/60 p-8 text-center"
        role={feedStatus === 'ok' ? undefined : 'status'}
      >
        <Paragraph typeStyle="body-sm" textColor="text-gray-300">
          {message}
        </Paragraph>
      </section>
    );
  } else {
    body = (
      <>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <li key={video.id} className="flex">
              <ReviewVideoCard
                video={video}
                playlistId={playlistId}
                locale={locale}
              />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-400">{t.privacyNote}</p>
        {videos.length >= FEED_MAX_ITEMS && (
          <p className="mt-1 text-xs text-gray-400">{t.feedLimitNote}</p>
        )}
      </>
    );
  }

  return (
    <main className="bg-neutral-950 text-white min-h-screen pt-header pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <TournamentTabs
          tournamentPath={tournamentPath}
          active="reviews"
          showPodium={isCompleted}
          bracketLabel={bracketTab}
          showFfa={hasFfaStage}
          showReviews
        />
        <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
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
              {t.intro}
            </Paragraph>
          </div>
          <a
            href={playlistHref}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] md:self-auto"
          >
            {t.openPlaylist}
          </a>
        </section>
        {body}
      </div>
    </main>
  );
}
