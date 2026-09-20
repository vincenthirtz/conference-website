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
// Le chargement des données passe par le loader partagé `loadHomeData`
// Les présentateurs V2 vivent
// sous `components/Home/*`.

import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { type HomeTeam } from '@/utils/home/loadHomeData';
import { type HomeMatchday } from '@/utils/home/loadNextMatchday';
import { type HomeClip, type HomeStandingRow } from '@/utils/home/loadHomeData';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { loadHomeData } from '@/utils/home/loadHomeData';
import { useT } from '@/lib/i18n/useT';
import { useTwitchLive } from '@/components/Home/useTwitchLive';
import HomeHeroV2 from '@/components/Home/HomeHeroV2';
import HomeStandings from '@/components/Home/HomeStandings';
import HomeSpotlight from '@/components/Home/HomeSpotlight';
import HomeNewsV2 from '@/components/Home/HomeNewsV2';
import HomeSupportStrip from '@/components/Home/HomeSupportStrip';
import HomeSocialWall from '@/components/Home/HomeSocialWall';
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
  clips: HomeClip[];
  countdownTarget: string | null;
  // L'horloge du rendu (ISR 15 min). Fabriquée ici plutôt que dans la carte :
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
  const data = await loadHomeData(DEFAULT_TENANT_ID);
  return {
    props: {
      news: data.news,
      socialFeed: data.socialFeed,
      upcomingTournament: data.upcomingTournament,
      partners: data.partners,
      teams: data.teams,
      matchdays: data.matchdays,
      standings: data.standings,
      clips: data.clips,
      countdownTarget: data.countdownTarget,
      nowIso: new Date().toISOString(),
      loadError: data.loadError,
    },
    revalidate: 900,
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
  clips,
  countdownTarget,
  nowIso,
  loadError,
}: HomeProps) {
  const t = useT(nsHomeV2);
  const live = useTwitchLive();

  return (
    <div>
      <HomeHeroV2
        countdownTarget={countdownTarget}
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

      <HomeSpotlight
        tournament={upcomingTournament}
        teams={teams}
        matchdays={matchdays}
        clips={clips}
      />

      {/* OÙ EN EST LA SAISON. Après « ce qui se joue », avant les actus :
          entre deux journées, c'est la question qu'on vient poser. */}
      {upcomingTournament && <HomeStandings rows={standings} />}

      <HomeNewsV2 news={news} />

      {/* Après les actus, et pas avant : une annonce rédigée pour le site
          prime sur un post recopié d'ailleurs. */}
      <HomeSocialWall items={socialFeed} />

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
