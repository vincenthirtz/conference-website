// pages/tournament/[id]/clips.tsx
// Page publique : les clips Twitch les plus vus pendant le tournoi.
//
// ISR comme ses sœurs. Les clips sont lus CÔTÉ SERVEUR (`fetchTwitchClips`,
// fenêtre fixe du premier jour au lendemain du dernier — cf.
// utils/tournament/clipsWindow) : le navigateur ne contacte Twitch qu'au clic
// sur un clip, qui s'ouvre là-bas. Ils étaient sur l'accueil jusqu'au
// 2026-10-23 ; un soir de finales, ils passaient avant les affiches.
//
// L'onglet est toujours affiché (cf. TournamentTabs) : sans clip, ou avant le
// coup d'envoi, la page le dit au lieu de répondre 404.

import type { ReactNode } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { readPublicTournament } from '@/utils/tournament/readPublicTournament';
import { tournamentClipsWindow } from '@/utils/tournament/clipsWindow';
import { tournamentRevalidateSeconds } from '@/utils/isr/stateRevalidate';
import { fetchTwitchClips } from '@/utils/twitch';
import { socialUrl } from '@/config/socials';
import { useT } from '@/lib/i18n/useT';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import ClipGrid, {
  type ClipCard,
} from '@/components/tournament/clips/ClipGrid';
import { TwitchIcon } from '@/components/Icons';
import nsTournamentClips from '@/lib/i18n/locales/fr/tournamentClips';
import { containsFfaStage } from '@/utils/stages/ffaStage';
import {
  bracketTabMode,
  type BracketTabMode,
} from '@/utils/stages/bracketStage';

type Tournament = {
  id: string;
  slug?: string | null;
  name: string;
  status: string;
  visibility?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type Props = {
  tournament: { id: string; slug: string | null; name: string; status: string };
  /** Faux avant le premier jour (ou sans date de début) : rien à chercher. */
  started: boolean;
  clips: ClipCard[];
  hasFfaStage: boolean;
  bracketTab: BracketTabMode;
  hasReviews: boolean;
  seo: SeoProps;
};

/** La chaîne de la Cup — même login que `components/Home/useTwitchLive`. */
const TWITCH_CHANNEL = 'womens_cup';
const TWITCH_CHANNEL_URL = socialUrl('twitch');

/** Six rangées de quatre. Au-delà, la chaîne Twitch fait mieux. */
const CLIPS_MAX = 24;

/**
 * Plancher de revalidation. Le « direct » des pages sœurs (60 s) ne sert à
 * rien ici : un clip n'a pas besoin d'apparaître à la minute, et chaque
 * régénération coûte trois appels à Twitch.
 */
const CLIPS_MIN_REVALIDATE_S = 900;

function buildClipsSeo(name: string): SeoProps {
  return {
    title: { fr: `Clips – ${name}`, en: `Clips – ${name}` },
    description: {
      fr: `Les clips Twitch les plus vus du tournoi ${name} — OW Women's Cup : les temps forts, en vidéo.`,
      en: `The most-watched Twitch clips of the ${name} tournament — OW Women's Cup: the highlights, on video.`,
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

  const read = await readPublicTournament<Tournament>(
    id,
    'id, name, slug, status, visibility, start_date, end_date',
    tenantId
  );
  if (!read) return { notFound: true, revalidate: 60 };
  const { tournament } = read;
  if (tournament.visibility != null && tournament.visibility !== 'public')
    return { notFound: true, revalidate: 60 };

  const now = new Date();
  const window = tournamentClipsWindow(tournament, now);

  const [stagesRes, clips] = await Promise.all([
    supabaseAdmin
      .from('tournament_stages')
      .select('stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id),
    // Ne lève jamais : sans Twitch, liste vide et état « pas encore de clip ».
    window
      ? fetchTwitchClips(TWITCH_CHANNEL, { ...window, limit: CLIPS_MAX })
      : Promise.resolve([]),
  ]);

  return {
    props: {
      tournament: {
        id: tournament.id,
        slug: tournament.slug ?? null,
        name: tournament.name,
        status: tournament.status,
      },
      started: window !== null,
      clips: clips.map((c) => ({
        id: c.id,
        title: c.title,
        url: c.url,
        thumbnailUrl: c.thumbnailUrl,
        viewCount: c.viewCount,
        duration: c.duration,
      })),
      hasFfaStage: containsFfaStage(stagesRes.data),
      bracketTab: bracketTabMode(stagesRes.data),
      hasReviews: read.reviewsPlaylistId !== null,
      seo: buildClipsSeo(tournament.name),
    },
    revalidate: Math.max(
      CLIPS_MIN_REVALIDATE_S,
      tournamentRevalidateSeconds(tournament, now)
    ),
  };
};

export default function TournamentClipsPage({
  tournament,
  started,
  clips,
  hasFfaStage,
  bracketTab,
  hasReviews,
}: Props) {
  const t = useT(nsTournamentClips);
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';

  let body: ReactNode;
  if (clips.length === 0) {
    body = (
      <section className="rounded-2xl border border-white/5 bg-black/60 p-8 text-center">
        <Paragraph typeStyle="body-sm" textColor="text-gray-300">
          {started ? t.empty : t.notStarted}
        </Paragraph>
      </section>
    );
  } else {
    body = (
      <>
        <ClipGrid
          clips={clips}
          className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        />
        <p className="mt-4 text-xs text-gray-400">{t.twitchNote}</p>
      </>
    );
  }

  return (
    <main className="bg-neutral-950 text-white min-h-screen pt-header pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <TournamentTabs
          tournamentPath={tournamentPath}
          active="clips"
          showPodium={isCompleted}
          bracketLabel={bracketTab}
          showFfa={hasFfaStage}
          showReviews={hasReviews}
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
            href={TWITCH_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 self-start rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] md:self-auto"
          >
            <span aria-hidden>
              <TwitchIcon className="h-4 w-4 text-[#a970ff]" />
            </span>
            {t.openChannel}
          </a>
        </section>
        {body}
      </div>
    </main>
  );
}
