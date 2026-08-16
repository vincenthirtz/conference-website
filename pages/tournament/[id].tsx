// pages/tournament/[id].tsx
//
// Landing tournoi — refonte premium esport. La page est un ORCHESTRATEUR mince :
// getStaticProps agrège les données (ISR 60 s), le rendu compose des sections
// autonomes sous components/tournament/landing/*. Chaque section se masque
// d'elle-même quand elle n'a pas de donnée réelle à montrer.

import { GetStaticPaths, GetStaticProps } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { formatDateRange } from '@/utils/tournamentDates';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';
import { logger } from '@/utils/logger';

import TournamentTabs from '@/components/tournament/TournamentTabs';
import ArbitrationPanel from '@/components/tournament/ArbitrationPanel';
import TournamentHero from '@/components/tournament/landing/TournamentHero';
import QuickFacts from '@/components/tournament/landing/QuickFacts';
import TournamentStats from '@/components/tournament/landing/TournamentStats';
import TeamRoster from '@/components/tournament/landing/TeamRoster';
import FormatInfographic from '@/components/tournament/landing/FormatInfographic';
import ScheduleTimeline from '@/components/tournament/landing/ScheduleTimeline';
import BracketPreview from '@/components/tournament/landing/BracketPreview';
import PrizeTeaser from '@/components/tournament/landing/PrizeTeaser';
import PrizePoolCard from '@/components/tournament/landing/PrizePoolCard';
import StreamingSection from '@/components/tournament/landing/StreamingSection';
import SponsorsStrip from '@/components/tournament/landing/SponsorsStrip';
import CommunitySection from '@/components/tournament/landing/CommunitySection';
import TournamentFaq from '@/components/tournament/landing/TournamentFaq';
import FinalCta from '@/components/tournament/landing/FinalCta';
import StickyRegisterBar from '@/components/tournament/landing/StickyRegisterBar';
import TournamentInfoCards from '@/components/tournament/landing/TournamentInfoCards';
import type {
  LandingTournament,
  LandingStage,
  LandingTeam,
  LandingCaster,
  LandingPartner,
  LandingLeague,
  TournamentPhase,
} from '@/components/tournament/landing/types';

type TournamentPageProps = {
  tournament: LandingTournament & {
    description_info?: string | null;
    schedule_details?: string | null;
    schedule_rules?: string | null;
    format_details?: string | null;
  };
  stages: LandingStage[];
  teams: LandingTeam[];
  casters: LandingCaster[];
  partners: LandingPartner[];
  totalTeams: number;
  totalMatches: number;
  finishedMatchesCount: number;
  hasFfaStage: boolean;
  leagues: LandingLeague[];
  seo: SeoProps;
};

/** Statut brut → phase normalisée pour toute la landing. */
function computePhase(status: string): TournamentPhase {
  switch (status) {
    case 'cancelled':
      return 'cancelled';
    case 'finished':
    case 'completed':
      return 'finished';
    case 'running':
    case 'ongoing':
    case 'live':
      return 'live';
    default:
      return 'upcoming';
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<TournamentPageProps> = async (
  ctx
) => {
  const rawId = ctx.params?.id;
  if (!rawId || Array.isArray(rawId)) {
    return { notFound: true, revalidate: 60 };
  }

  const asString = String(rawId);
  const isUuid =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      asString
    );

  const tournamentColumns =
    'id, name, short_name, slug, game, status, format, max_teams, start_date, end_date, rules_url, logo_url, banner_url, description_info, schedule_details, schedule_rules, format_details, visibility, created_at, updated_at';

  const tenantId = DEFAULT_TENANT_ID;

  let tournament: TournamentPageProps['tournament'] | null = null;

  if (isUuid) {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select(tournamentColumns)
      .eq('tenant_id', tenantId)
      .eq('id', asString)
      .single();
    if (!error && data) tournament = data as TournamentPageProps['tournament'];
  }

  if (!tournament) {
    const { data } = await supabaseAdmin
      .from('tournaments')
      .select(tournamentColumns)
      .eq('tenant_id', tenantId)
      .eq('slug', asString)
      .single();
    if (data) tournament = data as TournamentPageProps['tournament'];
  }

  if (!tournament) return { notFound: true, revalidate: 60 };

  const t = tournament as TournamentPageProps['tournament'] & {
    visibility?: string | null;
  };
  if (t.visibility && t.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }

  const tournamentId = tournament.id;

  const [
    stagesResult,
    totalCountResult,
    finishedCountResult,
    teamsResult,
    leaguesResult,
    partnersResult,
    castersResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('tournament_stages')
      .select(
        'id, tournament_id, name, stage_type, default_match_format, swiss_rounds, bracket_format, visible'
      )
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true }),

    supabaseAdmin
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled'),

    supabaseAdmin
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .eq('status', 'finished'),

    supabaseAdmin
      .from('tournament_teams')
      .select('team:teams ( id, slug, name, short_name, logo_url )')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId),

    supabaseAdmin
      .from('league_tournaments')
      .select('league:leagues ( slug, name, is_public, status )')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId),

    // Partenaires — table globale (non tenant-scopée, cf. S5d).
    supabaseAdmin
      .from('partners')
      .select('id, name, category, logo_url, website_url, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),

    // Casting — table globale.
    supabaseAdmin
      .from('cast_members')
      .select(
        'id, name, title, image_url, twitch_url, city, is_active, is_promo, sort_order'
      )
      .eq('is_active', true)
      .eq('is_promo', false)
      .eq('is_internal', false)
      .order('sort_order', { ascending: true }),
  ]);

  if (stagesResult.error)
    logger.error('tournament stages error:', stagesResult.error);
  if (totalCountResult.error)
    logger.error('tournament matches count error:', totalCountResult.error);
  if (finishedCountResult.error)
    logger.error('tournament finished count error:', finishedCountResult.error);
  if (teamsResult.error)
    logger.error('tournament teams error:', teamsResult.error);
  if (leaguesResult.error)
    logger.error('tournament leagues error:', leaguesResult.error);
  if (partnersResult.error)
    logger.error('tournament partners error:', partnersResult.error);
  if (castersResult.error)
    logger.error('tournament casters error:', castersResult.error);

  const rawStages = (stagesResult.data || []) as unknown as (LandingStage & {
    visible?: boolean | null;
  })[];
  const stages: LandingStage[] = rawStages
    .filter((s) => s.visible !== false)
    .map((s) => ({
      id: s.id,
      name: s.name,
      stage_type: s.stage_type,
      default_match_format: s.default_match_format ?? null,
      swiss_rounds: s.swiss_rounds ?? null,
      bracket_format: s.bracket_format ?? null,
    }));

  const totalMatches = totalCountResult.count ?? 0;
  const finishedMatchesCount = finishedCountResult.count ?? 0;

  // Supabase infère les embeds (`team:teams(...)`) comme des tableaux ; on
  // normalise via un cast local — pattern hérité du hub tournoi.
  const teamRows = (teamsResult.data ?? []) as unknown as {
    team: LandingTeam | null;
  }[];
  const teamMap = new Map<string, LandingTeam>();
  teamRows.forEach((row) => {
    if (row.team) teamMap.set(row.team.id, row.team);
  });
  const teams = Array.from(teamMap.values());

  const leagueRows = (leaguesResult.data ?? []) as unknown as {
    league: {
      slug: string | null;
      name: string;
      is_public: boolean | null;
      status: string | null;
    } | null;
  }[];
  const leagueMap = new Map<string, LandingLeague>();
  leagueRows.forEach((row) => {
    const l = row.league;
    if (
      l &&
      l.slug &&
      l.is_public === true &&
      l.status !== 'draft' &&
      !leagueMap.has(l.slug)
    ) {
      leagueMap.set(l.slug, { slug: l.slug, name: l.name });
    }
  });
  const leagues = Array.from(leagueMap.values());

  const partnerRows = (partnersResult.data ?? []) as unknown as {
    id: string;
    name: string;
    category: string;
    logo_url: string | null;
    website_url: string | null;
  }[];
  const partners: LandingPartner[] = partnerRows
    .filter(
      (r) =>
        r.category === 'super' ||
        r.category === 'major' ||
        r.category === 'cultural'
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as LandingPartner['category'],
      logoUrl: r.logo_url ?? null,
      websiteUrl: r.website_url ?? null,
    }));

  const casterRows = (castersResult.data ?? []) as unknown as {
    id: string;
    name: string;
    title: string | null;
    image_url: string | null;
    twitch_url: string | null;
    city: string | null;
  }[];
  const casters: LandingCaster[] = casterRows.map((r) => ({
    id: r.id,
    name: r.name,
    title: r.title ?? null,
    image_url: r.image_url ?? null,
    twitch_url: r.twitch_url ?? null,
    city: r.city ?? null,
  }));

  return {
    props: {
      tournament,
      stages,
      teams,
      casters,
      partners,
      totalTeams: teams.length,
      totalMatches,
      finishedMatchesCount,
      hasFfaStage: stages.some((s) => s.stage_type === 'ffa'),
      leagues,
      seo: buildTournamentSeo(tournament),
    },
    revalidate: 60,
  };
};

export default function TournamentPage({
  tournament,
  stages,
  teams,
  casters,
  partners,
  totalTeams,
  totalMatches,
  hasFfaStage,
  leagues,
}: Omit<TournamentPageProps, 'seo'>) {
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const registerHref = `/team/create?tournament=${tournament.id}`;

  const phase = computePhase(tournament.status);
  const registrationOpen = phase === 'upcoming';
  const maxTeams = tournament.max_teams ?? null;
  const placesRemaining =
    maxTeams !== null ? Math.max(0, maxTeams - totalTeams) : null;
  const isCompleted = phase === 'finished';

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <TournamentHero
        tournament={tournament}
        phase={phase}
        tournamentPath={tournamentPath}
        totalTeams={totalTeams}
        placesRemaining={placesRemaining}
        leagues={leagues}
        registrationOpen={registrationOpen}
      />

      <QuickFacts
        tournament={tournament}
        totalTeams={totalTeams}
        maxTeams={maxTeams}
      />

      <div className="mx-auto mt-12 w-full max-w-6xl px-4 sm:px-6">
        <TournamentTabs
          tournamentPath={tournamentPath}
          active="hub"
          showPodium={isCompleted}
          showFfa={hasFfaStage}
        />
      </div>

      <TournamentStats
        totalTeams={totalTeams}
        placesRemaining={placesRemaining}
        totalMatches={totalMatches}
        stagesCount={stages.length}
      />

      <TeamRoster
        teams={teams}
        totalTeams={totalTeams}
        tournamentPath={tournamentPath}
      />

      <FormatInfographic stages={stages} tournamentPath={tournamentPath} />

      <TournamentInfoCards
        descriptionInfo={tournament.description_info}
        scheduleDetails={tournament.schedule_details}
        scheduleRules={tournament.schedule_rules}
        formatDetails={tournament.format_details}
      />

      <ScheduleTimeline tournament={tournament} phase={phase} />

      <BracketPreview stages={stages} tournamentPath={tournamentPath} />

      <PrizeTeaser />

      <PrizePoolCard tournamentId={tournament.id} />

      <StreamingSection casters={casters} phase={phase} />

      <SponsorsStrip partners={partners} />

      <CommunitySection />

      <TournamentFaq />

      <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <ArbitrationPanel slugOrId={tournament.slug || tournament.id} />
      </div>

      <FinalCta
        registrationOpen={registrationOpen}
        registerHref={registerHref}
      />

      <StickyRegisterBar
        registrationOpen={registrationOpen}
        registerHref={registerHref}
        placesRemaining={placesRemaining}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * SEO — SportsEvent + BreadcrumbList + FAQPage (JSON-LD groupé),
 * OG image = banner_url du tournoi.
 * ═══════════════════════════════════════════════════════════*/

const SEO_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://owwomenscup.fr';

const OPEN_REGISTRATION_STATUSES = new Set([
  'upcoming',
  'registration',
  'draft',
]);

function getStatusLabel(status: string): string {
  switch (status) {
    case 'upcoming':
      return 'À venir';
    case 'running':
    case 'ongoing':
      return 'En cours';
    case 'finished':
    case 'completed':
      return 'Terminé';
    default:
      return status;
  }
}
function getStatusLabelEn(status: string): string {
  switch (status) {
    case 'upcoming':
      return 'Upcoming';
    case 'running':
    case 'ongoing':
      return 'Ongoing';
    case 'finished':
    case 'completed':
      return 'Completed';
    default:
      return status;
  }
}

function buildTournamentSeo(
  tournament: TournamentPageProps['tournament']
): SeoProps {
  const game = tournament.game || 'Overwatch';
  const dateLabelFr = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    'fr'
  );
  const dateLabelEn = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    'en'
  );
  const statusLabelFr = getStatusLabel(tournament.status);
  const statusLabelEn = getStatusLabelEn(tournament.status);

  const descriptionFr = [
    `${tournament.name} — tournoi ${game} OW Women's Cup`,
    dateLabelFr ? dateLabelFr.toLowerCase() : null,
    `(${statusLabelFr.toLowerCase()}).`,
    'Bracket, résultats, équipes, calendrier et diffusion.',
  ]
    .filter(Boolean)
    .join(' ');

  const descriptionEn = [
    `${tournament.name} — ${game} tournament, OW Women's Cup`,
    dateLabelEn ? dateLabelEn.toLowerCase() : null,
    `(${statusLabelEn.toLowerCase()}).`,
    'Bracket, results, teams, schedule and broadcast.',
  ]
    .filter(Boolean)
    .join(' ');

  const canonicalUrl = `${SEO_BASE_URL}/tournament/${tournament.slug || tournament.id}`;
  const isCancelled = tournament.status === 'cancelled';
  const registrationOpen =
    !isCancelled && OPEN_REGISTRATION_STATUSES.has(tournament.status);

  const sportsEvent: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: tournament.name,
    url: canonicalUrl,
    ...(tournament.start_date ? { startDate: tournament.start_date } : {}),
    ...(tournament.end_date ? { endDate: tournament.end_date } : {}),
    ...(tournament.banner_url ? { image: tournament.banner_url } : {}),
    eventStatus: isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: canonicalUrl },
    organizer: {
      '@type': 'Organization',
      name: "OW Women's Cup",
      url: SEO_BASE_URL,
    },
    sport: game,
    inLanguage: 'fr-FR',
    ...(registrationOpen
      ? {
          offers: {
            '@type': 'Offer',
            availability: 'InStock',
            url: `${SEO_BASE_URL}/team/create?tournament=${tournament.id}`,
            price: '0',
            priceCurrency: 'EUR',
          },
        }
      : {}),
  };

  const breadcrumb: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SEO_BASE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Tournois',
        item: `${SEO_BASE_URL}/tournaments`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: tournament.name,
        item: canonicalUrl,
      },
    ],
  };

  const faq = nsTournamentLanding.fr;
  const faqPage: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      [faq.faqQ1, faq.faqA1],
      [faq.faqQ2, faq.faqA2],
      [faq.faqQ3, faq.faqA3],
      [faq.faqQ4, faq.faqA4],
      [faq.faqQ5, faq.faqA5],
      [faq.faqQ6, faq.faqA6],
    ].map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return {
    title: tournament.name,
    description: { fr: descriptionFr, en: descriptionEn },
    type: 'website',
    ...(tournament.banner_url ? { image: tournament.banner_url } : {}),
    jsonLd: [sportsEvent, breadcrumb, faqPage],
  };
}

const tournamentSeoFallback: SeoProps = {
  title: { fr: 'Tournoi', en: 'Tournament' },
  description: {
    fr: "Suivez les tournois Overwatch de la OW Women's Cup : bracket, résultats, équipes et calendrier des matchs.",
    en: "Follow the OW Women's Cup Overwatch tournaments: bracket, results, teams and match schedule.",
  },
};

TournamentPage.seo = tournamentSeoFallback;
