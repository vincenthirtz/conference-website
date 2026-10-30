// pages/tournament/[id].tsx
//
// Landing tournoi — refonte premium esport. La page est un ORCHESTRATEUR mince :
// getStaticProps agrège les données (ISR selon l'état du tournoi : 60 s en
// cours, plus long une fois terminé — utils/isr/stateRevalidate), le rendu compose des sections
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
import BracketPreview from '@/components/tournament/landing/BracketPreview';
import PrizeTeaser from '@/components/tournament/landing/PrizeTeaser';
import PrizePoolCard from '@/components/tournament/landing/PrizePoolCard';
import StreamingSection from '@/components/tournament/landing/StreamingSection';
import { isRegularSeason } from '@/components/tournament/landing/types';
import SponsorsStrip from '@/components/tournament/landing/SponsorsStrip';
import CommunitySection from '@/components/tournament/landing/CommunitySection';
import TournamentFaq from '@/components/tournament/landing/TournamentFaq';
import FinalCta from '@/components/tournament/landing/FinalCta';
import StickyRegisterBar from '@/components/tournament/landing/StickyRegisterBar';
import TournamentInfoCards from '@/components/tournament/landing/TournamentInfoCards';
import LiveHub from '@/components/tournament/landing/LiveHub';
import FinalRanking from '@/components/tournament/landing/FinalRanking';
import {
  readPublicTournamentStandings,
  type PublicStanding,
} from '@/utils/public/readStandings';
import {
  buildLiveHub,
  type LiveHub as LiveHubData,
} from '@/utils/tournament/liveHub';
import {
  summarizeLandingMatches,
  type LandingMatchRow,
} from '@/utils/tournament/landingMatches';
import { readPublicTournament } from '@/utils/tournament/readPublicTournament';
import { tournamentRevalidateSeconds } from '@/utils/isr/stateRevalidate';
import {
  readPublicStandings,
  type PublicStandingsTable,
} from '@/utils/stages/publicStandings';
import type {
  LandingTournament,
  LandingRound,
  LandingStage,
  LandingTeam,
  LandingPartner,
  LandingLeague,
  TournamentPhase,
} from '@/components/tournament/landing/types';
import { containsFfaStage } from '@/utils/stages/ffaStage';
import {
  bracketTabMode,
  type BracketTabMode,
} from '@/utils/stages/bracketStage';
import { gameLabel } from '@/config/games';
import { tournamentRegisterHref } from '@/utils/tournaments/registerHref';

type TournamentPageProps = {
  tournament: LandingTournament & {
    description_info?: string | null;
    schedule_details?: string | null;
    schedule_rules?: string | null;
    format_details?: string | null;
  };
  stages: LandingStage[];
  rounds: LandingRound[];
  teams: LandingTeam[];
  partners: LandingPartner[];
  totalTeams: number;
  totalMatches: number;
  finishedMatchesCount: number;
  hasFfaStage: boolean;
  bracketTab: BracketTabMode;
  leagues: LandingLeague[];
  /** Suivi en cours de tournoi : direct, à suivre, résultats. */
  hub: LiveHubData;
  /** Classement OFFICIEL (celui de la page Classement). */
  standings: PublicStandingsTable[];
  /** Classement FIGÉ (final_rankings) d'un tournoi clos ; vide sinon. */
  finalRanking: PublicStanding[];
  /** Playlist « Reviews » configurée → onglet affiché. */
  hasReviews: boolean;
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

  const tournamentColumns =
    'id, name, short_name, slug, game, status, format, max_teams, solo_mode, pooled_teams, start_date, end_date, rules_url, logo_url, banner_url, description_info, hero_subtitle, schedule_details, schedule_rules, format_details, visibility, created_at, updated_at';

  const tenantId = DEFAULT_TENANT_ID;

  // Ligne du tournoi ET playlist Reviews en une lecture (UUID ou slug).
  const read = await readPublicTournament<TournamentPageProps['tournament']>(
    String(rawId),
    tournamentColumns,
    tenantId
  );
  if (!read) return { notFound: true, revalidate: 60 };
  const tournament = read.tournament;
  const hasReviews = read.reviewsPlaylistId !== null;

  const t = tournament as TournamentPageProps['tournament'] & {
    visibility?: string | null;
  };
  if (t.visibility && t.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }

  const tournamentId = tournament.id;

  // UNE lecture des matchs pour toute la page : le bloc de suivi, les deux
  // compteurs, l'aperçu des manches et le coup d'envoi en sont dérivés
  // (`summarizeLandingMatches`). Il y en avait cinq, dont deux `count` et une
  // séquentielle, à chaque régénération.
  const [
    stagesResult,
    teamsResult,
    leaguesResult,
    partnersResult,
    matchesResult,
    standings,
    finalRankingResult,
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

    // Tous les matchs avec leurs équipes. Un tournoi en compte quelques
    // dizaines — le tri direct / à suivre / résultats, les compteurs et les
    // manches se font en mémoire, testables sans base.
    supabaseAdmin
      .from('matches')
      .select(
        'id, scheduled_at, status, is_bye, round_name, round_number, bracket_side, match_format, team1_score, team2_score, winner_team_id, forfeit_team_id, stream_url, team1:team1_id ( id, slug, name, short_name, logo_url ), team2:team2_id ( id, slug, name, short_name, logo_url )'
      )
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .is('deleted_at', null)
      .neq('status', 'cancelled'),

    readPublicStandings(tenantId, tournamentId),

    // Le classement figé, pour un tournoi clos seulement. Le lecteur LÈVE :
    // rattrapé ici, une panne ne coûte que la section, et `degraded`
    // raccourcit la fenêtre de régénération.
    computePhase(tournament.status) === 'finished'
      ? readPublicTournamentStandings(tournamentId, tenantId).then(
          (rows) => ({ rows, error: false }),
          (err: unknown) => {
            logger.error('tournament final ranking error:', err);
            return { rows: [] as PublicStanding[], error: true };
          }
        )
      : Promise.resolve({ rows: [] as PublicStanding[], error: false }),
  ]);

  if (stagesResult.error)
    logger.error('tournament stages error:', stagesResult.error);
  if (teamsResult.error)
    logger.error('tournament teams error:', teamsResult.error);
  if (leaguesResult.error)
    logger.error('tournament leagues error:', leaguesResult.error);
  if (partnersResult.error)
    logger.error('tournament partners error:', partnersResult.error);
  if (matchesResult.error)
    logger.error('tournament matches error:', matchesResult.error);

  const now = new Date();
  const { hubMatches, rounds, totalMatches, finishedMatchesCount, kickoffAt } =
    summarizeLandingMatches(
      (matchesResult.data ?? []) as unknown as LandingMatchRow[]
    );
  const hub = buildLiveHub(hubMatches, now);

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

  // Une lecture en échec ne fige pas une page incomplète pour une heure ou un
  // jour : fenêtre du direct, le temps de se rattraper.
  const degraded = Boolean(
    stagesResult.error ||
      teamsResult.error ||
      leaguesResult.error ||
      partnersResult.error ||
      matchesResult.error ||
      finalRankingResult.error
  );

  return {
    props: {
      tournament: { ...tournament, kickoff_at: kickoffAt },
      stages,
      rounds,
      teams,
      partners,
      totalTeams: teams.length,
      totalMatches,
      finishedMatchesCount,
      hasFfaStage: containsFfaStage(stages),
      bracketTab: bracketTabMode(stages),
      leagues,
      hub,
      standings,
      finalRanking: finalRankingResult.rows,
      hasReviews,
      seo: buildTournamentSeo(tournament),
    },
    // En cours : 60 s (un score régénère la page à la demande, le reste —
    // programmation, inscriptions — attend la fenêtre). Terminé : 1 h, puis
    // un jour au-delà d'une semaine (utils/isr/stateRevalidate).
    revalidate: tournamentRevalidateSeconds(tournament, now, { degraded }),
  };
};

export default function TournamentPage({
  tournament,
  stages,
  rounds,
  teams,
  partners,
  totalTeams,
  totalMatches,
  finishedMatchesCount,
  hasFfaStage,
  bracketTab,
  leagues,
  hub,
  standings,
  finalRanking,
  hasReviews,
}: Omit<TournamentPageProps, 'seo'>) {
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const registerHref = tournamentRegisterHref(tournament);

  const phase = computePhase(tournament.status);
  const maxTeams = tournament.max_teams ?? null;
  const placesRemaining =
    maxTeams !== null ? Math.max(0, maxTeams - totalTeams) : null;
  // « Ouvert » demande DEUX conditions : le tournoi n'a pas commencé, ET il
  // reste une place. Seule la première était testée — la landing affichait donc
  // « Complet » dans sa pastille et « Inscrire mon équipe » juste en dessous.
  // Ce booléen pilote le hero, le bloc final et la barre collante à la fois.
  const registrationOpen = phase === 'upcoming' && placesRemaining !== 0;
  const isCompleted = phase === 'finished';
  // Tournoi lancé (en cours, terminé ou annulé) : la page sert à SUIVRE.
  const running = phase !== 'upcoming';

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
        liveMatch={hub.live[0] ?? null}
        nextMatch={hub.upcoming[0] ?? null}
        champion={finalRanking.find((r) => r.rank === 1) ?? null}
        tabs={
          <TournamentTabs
            tournamentPath={tournamentPath}
            active="hub"
            showPodium={isCompleted}
            bracketLabel={bracketTab}
            showFfa={hasFfaStage}
            showReviews={hasReviews}
          />
        }
      />

      <QuickFacts
        tournament={tournament}
        totalTeams={totalTeams}
        maxTeams={maxTeams}
      />

      {/* DEUX PAGES EN UNE. Avant le coup d'envoi, la landing présente le
          tournoi : chiffres, format, déroulé, récompenses, inscription.
          Une fois lancé, on vient suivre : le suivi et la diffusion passent
          en tête, et les blocs qui ne faisaient plus que répéter le suivi
          (chiffres, déroulé J1→J7, podium « À venir », « inscriptions
          closes ») s'effacent — 17 blocs en file, c'était une page qu'on
          ne lisait plus jusqu'en bas. */}
      {running && (
        <>
          {/* Clos : le classement FINAL d'abord, le bilan (résultats,
              classement de phase) ensuite. */}
          {isCompleted && (
            <FinalRanking
              ranking={finalRanking}
              tournamentPath={tournamentPath}
            />
          )}
          <LiveHub
            hub={hub}
            standings={standings}
            tournamentPath={tournamentPath}
            finished={isCompleted}
          />
          <StreamingSection
            phase={phase}
            showCasting={isRegularSeason(tournament.slug)}
          />
        </>
      )}

      {!running && (
        <TournamentStats
          phase={phase}
          totalTeams={totalTeams}
          placesRemaining={placesRemaining}
          totalMatches={totalMatches}
          finishedMatches={finishedMatchesCount}
          stagesCount={stages.length}
        />
      )}

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

      {!running && (
        <>
          <BracketPreview
            stages={stages}
            rounds={rounds}
            tournamentPath={tournamentPath}
          />
          {/* Avant le tournoi : les premiers matchs, juste après le déroulé
              qui les annonce. */}
          {hub.upcoming.length > 0 && (
            <LiveHub
              hub={hub}
              standings={standings}
              tournamentPath={tournamentPath}
            />
          )}
          <PrizeTeaser />
        </>
      )}

      <PrizePoolCard tournamentId={tournament.id} />

      {!running && (
        <StreamingSection
          phase={phase}
          showCasting={isRegularSeason(tournament.slug)}
        />
      )}

      <SponsorsStrip partners={partners} />

      <CommunitySection />

      <TournamentFaq />

      <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <ArbitrationPanel slugOrId={tournament.slug || tournament.id} />
      </div>

      {/* Inscriptions closes : le bloc final ne faisait que répéter la carte
          Discord de la section Communauté, juste au-dessus. */}
      {registrationOpen && (
        <FinalCta
          registrationOpen={registrationOpen}
          registerHref={registerHref}
        />
      )}

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
  const game = gameLabel(tournament.game);
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
            url: `${SEO_BASE_URL}${tournamentRegisterHref(tournament)}`,
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
