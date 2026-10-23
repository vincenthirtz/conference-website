// pages/index.tsx
//
// Page d'accueil — refonte 2026 : structure resserrée en sections claires
// (hero focalisé avec countdown intégré, spotlight événement live-aware,
// actus, soutiens).
//
// DEUX BLOCS ONT ÉTÉ RETIRÉS, pour la même raison : ils redemandaient ce que la
// page demandait déjà.
//   - la newsletter, dont le formulaire vit dans le pied de page, présent sur
//     toutes les pages ;
//   - « Participer en 3 étapes », dont le bouton d'inscription doublonnait
//     celui du hero — et affichait « Complet » une seconde fois, le tournoi
//     étant plein.
//
// UN JOUR DE MATCH, L'ORDRE CHANGE. Les affiches du jour remontent juste sous
// le hero, devant l'encart d'événement (Halloween…), qui passe sous le
// classement ; le hero vise le prochain coup d'envoi. Rien à défaire : la
// journée jouée, `loadNextMatchdays` ne l'annonce plus et l'ordre habituel
// revient de lui-même.
//
// Le chargement des données passe par le loader partagé `loadHomeData`
// Les présentateurs V2 vivent
// sous `components/Home/*`.

import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { type HomeTeam } from '@/utils/home/loadHomeData';
import {
  isFinalsDay,
  matchdayToday,
  nextKickoff,
  type HomeMatchday,
} from '@/utils/home/loadNextMatchday';
import { type HomeStandingRow } from '@/utils/home/loadHomeData';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { loadHomeData } from '@/utils/home/loadHomeData';
import { homeRevalidateSeconds } from '@/utils/isr/stateRevalidate';
import { useT } from '@/lib/i18n/useT';
import { useTwitchLive } from '@/components/Home/useTwitchLive';
import HomeHeroV2 from '@/components/Home/HomeHeroV2';
import HomeStandings from '@/components/Home/HomeStandings';
import HomeSpotlight from '@/components/Home/HomeSpotlight';
import HomeNewsV2 from '@/components/Home/HomeNewsV2';
import HomeSupportStrip from '@/components/Home/HomeSupportStrip';
import HomeOrganiserCta from '@/components/Home/HomeOrganiserCta';
import HomeSocialWall from '@/components/Home/HomeSocialWall';
import HomeEventSpotlight from '@/components/Home/HomeEventSpotlight';
import HomeTcgShowcase from '@/components/Home/HomeTcgShowcase';
import {
  readHomeTcgShowcase,
  type HomeTcgShowcase as HomeTcgShowcaseData,
} from '@/utils/tcg/readHomeTcgShowcase';
import {
  homeEventSpotlight,
  isHomeEventVisible,
} from '@/config/homeEventSpotlight';
import type { SocialFeedItem } from '@/utils/social/socialFeed';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

type HomeProps = {
  news: HomeNewsItem[];
  socialFeed: SocialFeedItem[];
  upcomingTournament: UpcomingTournament | null;
  partners: HomePartner[];
  teams: HomeTeam[];
  matchdays: HomeMatchday[];
  standings: HomeStandingRow[];
  countdownTarget: string | null;
  /** Le bloc TCG : trois cartes, le total à collectionner, le barème. */
  tcg: HomeTcgShowcaseData;
  // L'horloge du rendu (ISR 15 min à 1 h). Fabriquée ici plutôt que dans la carte :
  // un `new Date()` côté composant donne le build au serveur et la visite au
  // client — deux valeurs qui divergent dès qu'un minuit passe entre les deux.
  nowIso: string;
  // Vrai quand le chargement du contenu dynamique a échoué côté serveur : on le
  // signale plutôt que d'afficher une home faussement vide (hero reste rendu).
  loadError: boolean;
};

// S5d: getStaticProps n'a pas la requête → DEFAULT_TENANT_ID. TODO(S7) SSR/ISR
// par tenant en multi-tenant.
export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const now = new Date();
  // En parallèle : le bloc TCG ne lève jamais et n'attend rien du reste.
  const [data, tcg] = await Promise.all([
    loadHomeData(DEFAULT_TENANT_ID),
    readHomeTcgShowcase(DEFAULT_TENANT_ID, now),
  ]);
  return {
    props: {
      news: data.news,
      socialFeed: data.socialFeed,
      upcomingTournament: data.upcomingTournament,
      partners: data.partners,
      teams: data.teams,
      matchdays: data.matchdays,
      standings: data.standings,
      countdownTarget: data.countdownTarget,
      tcg,
      nowIso: now.toISOString(),
      loadError: data.loadError,
    },
    // 15 min un jour de matchs (dès 2 h avant le premier coup d'envoi), 1 h
    // sinon. Scores et actualités régénèrent l'accueil à la demande ; le reste
    // (mur des réseaux, vitrine TCG, compteur d'inscrites) supporte
    // l'heure. Cf. utils/isr/stateRevalidate.
    revalidate: homeRevalidateSeconds(
      data.matchdays[0]?.matches[0]?.scheduledAt ?? null,
      now,
      { degraded: data.loadError }
    ),
  };
};

/**
 * La compétition est-elle LANCÉE ? Le coup d'envoi est passé et l'édition n'est
 * ni terminée ni annulée. Sans date de début, on s'en tient à « non » : mieux
 * vaut inviter à s'inscrire une journée de trop que d'annoncer une saison qui
 * n'a pas commencé.
 */
function isTournamentRunning(
  tournament: UpcomingTournament | null,
  nowIso: string
): boolean {
  if (!tournament?.startDate) return false;
  if (['completed', 'finished', 'cancelled'].includes(tournament.status)) {
    return false;
  }
  return new Date(tournament.startDate).getTime() <= new Date(nowIso).getTime();
}

function Home({
  news,
  socialFeed,
  upcomingTournament,
  partners,
  teams,
  matchdays,
  standings,
  countdownTarget,
  tcg,
  nowIso,
  loadError,
}: HomeProps) {
  const t = useT(nsHomeV2);
  const live = useTwitchLive();

  // Avec l'horloge du rendu, comme le reste : SSR et client disent la même.
  const now = new Date(nowIso);
  const today = matchdayToday(matchdays, now);
  const finalsTonight = today !== null && isFinalsDay(today);
  const eventSpotlight = isHomeEventVisible(homeEventSpotlight, nowIso) ? (
    <HomeEventSpotlight event={homeEventSpotlight} />
  ) : null;

  return (
    <div>
      <HomeHeroV2
        // Un jour de match, le décompte vise le prochain coup d'envoi : le
        // jalon réglé (ouverture de la saison) est passé depuis longtemps.
        countdownTarget={(today && nextKickoff(today, now)) ?? countdownTarget}
        finalsKickoff={finalsTonight ? today.matches[0].scheduledAt : null}
        isLive={live.live}
        // « Complet » se DÉDUIT des données déjà chargées (places vs inscrites)
        // plutôt que d'un drapeau à penser à lever : le jour où une place se
        // libère, la home réinvite d'elle-même.
        tournamentFull={
          upcomingTournament?.maxTeams != null &&
          upcomingTournament.teamCount >= upcomingTournament.maxTeams
        }
        tournamentMaxTeams={upcomingTournament?.maxTeams ?? null}
        // Lancé = la date de début est passée et l'édition n'est pas close.
        // Calculé ici, avec l'horloge du rendu, pour que SSR et client disent
        // la même chose.
        tournamentRunning={isTournamentRunning(upcomingTournament, nowIso)}
        tournamentTeamCount={upcomingTournament?.teamCount ?? null}
        tournamentEndDate={upcomingTournament?.endDate ?? null}
        tournamentPath={
          upcomingTournament
            ? `/tournament/${upcomingTournament.slug || upcomingTournament.id}`
            : null
        }
      />

      {loadError && (
        <div className="container mx-auto mt-6 px-4">
          <div
            className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm text-red-200">{t.loadError}</p>
          </div>
        </div>
      )}

      {/* Événement ponctuel daté (Halloween…) : sous le hero pour être vu
          avant la clôture des inscriptions ; se retire seul passé sa date.
          Un jour de match, il cède la place aux affiches (plus bas). */}
      {!today && eventSpotlight}

      <HomeSpotlight
        tournament={upcomingTournament}
        teams={teams}
        matchdays={matchdays}
        finalsTonight={finalsTonight}
      />

      {/* OÙ EN EST LA SAISON. Après « ce qui se joue », avant les actus :
          entre deux journées, c'est la question qu'on vient poser. */}
      {upcomingTournament && <HomeStandings rows={standings} />}

      {/* Un jour de match, l'événement passe au second plan : après les
          affiches et le classement, avant le TCG. */}
      {today && eventSpotlight}

      {/* Le TCG : prolongement des matchs (chaque match rapporte des pièces),
          et seule porte vers le jeu de cartes pour qui ne s'est pas encore
          inscrite. Avant les actus pour être vu sans tout faire défiler. */}
      <HomeTcgShowcase showcase={tcg} />

      <HomeNewsV2 news={news} />

      {/* Après les actus, et pas avant : une annonce rédigée pour le site
          prime sur un post recopié d'ailleurs. */}
      <HomeSocialWall items={socialFeed} />

      {/* Après la démonstration, avant le bandeau de confiance : qui a fait
          défiler jusqu'ici a vu tourner ce qu'on lui propose de monter. */}
      <HomeOrganiserCta />

      <HomeSupportStrip partners={partners} />
    </div>
  );
}

const homeSeo: SeoProps = {
  description: {
    fr: "Tournoi Overwatch 100% féminin : suis l'édition 2026 — équipes, casts, inscriptions et calendrier des matchs en direct.",
    en: "The 100% women's Overwatch tournament: follow the 2026 edition — teams, casts, sign-ups and the live match schedule.",
  },
};

Home.seo = homeSeo;

export default Home;
