// pages/player/match/[matchId].tsx
// Espace joueur — le FIL DU MATCH (docs/PLAN-espace-joueur.md § J1).
//
// Coquille : SEO + provider de zone + lecture de l'id dans l'URL. Le contenu
// vit dans components/player/screens/PlayerMatchScreen, pour rester affichable
// tel quel depuis l'inspection admin (cf. docs/PLAN-espace-unifie.md).
//
// URL volontairement partageable : c'est le lien qu'une capitaine colle dans le
// fil Discord de son match.

import { useRouter } from 'next/router';
import PlayerMatchScreen from '@/components/player/screens/PlayerMatchScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

function PlayerMatchPage() {
  const router = useRouter();
  const raw = router.query.matchId;
  const matchId = Array.isArray(raw) ? raw[0] : raw;

  // Premier rendu côté client sans query résolue : squelette, pas d'appel à
  // vide (qui partirait sur /api/player/matches/undefined).
  if (!matchId) return <PlayerPageSkeleton rows={3} />;

  return (
    <PlayerAreaProvider>
      <PlayerMatchScreen matchId={matchId} />
    </PlayerAreaProvider>
  );
}

const playerMatchSeo: SeoProps = {
  title: {
    fr: 'Mon match',
    en: 'My match',
  },
  description: {
    fr: "Check-in, feuille de match et score d'une rencontre OW Women's Cup.",
    en: "Check-in, lineup and score for one OW Women's Cup fixture.",
  },
  noindex: true,
};

PlayerMatchPage.seo = playerMatchSeo;

export default PlayerMatchPage;
