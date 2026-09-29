// pages/player/scouting/[teamId].tsx
//
// Dossier d'adversaire (N5) — la page de préparation d'un affrontement,
// archétype FICHE (lot P15). L'écran vit dans
// `features/player/network/ui/scouting` ; la lecture passe par le client du
// module, qui porte l'ÉQUIPE ACTIVE (`?teamId=`) et jamais le sujet : le
// dossier se calcule du point de vue de notre équipe.

import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { loginHrefFor } from '@/utils/player/sessionExpiry';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import ScoutingScreen from '@/features/player/network/ui/scouting/ScoutingScreen';

function ScoutingPage() {
  const router = useRouter();
  // Retour au dossier après connexion : c'est une page qu'on ouvre depuis un
  // lien (annuaire, fil de match), la perdre renvoyait à l'accueil.
  const { ready, loading: authLoading } = usePlayerSession({
    redirectTo: loginHrefFor(router.isReady ? router.asPath : '/player/teams'),
  });
  const teamId =
    typeof router.query.teamId === 'string' ? router.query.teamId : null;

  if (authLoading || !ready) return <PlayerPageSkeleton />;
  return <ScoutingScreen targetTeamId={teamId} />;
}

const scoutingSeo: SeoProps = {
  title: { fr: "Dossier d'adversaire", en: 'Opponent dossier' },
  description: {
    fr: 'Préparer un affrontement à partir des résultats déjà joués.',
    en: 'Prepare an encounter from games already played.',
  },
  noindex: true,
};

ScoutingPage.seo = scoutingSeo;

// Cache joueuse (lot P15) + coquille (lot P8). La page garde sa propre
// redirection de session (retour `?next=` exact) : `redirectTo` absent.
export default withPlayerQuery(withPlayerShell(ScoutingPage));
