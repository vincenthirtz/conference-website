// pages/player/tournaments/[id]/reglement.tsx
//
// La liseuse du règlement d'un tournoi : lire le PDF jusqu'en bas, cocher
// « J'ai bien lu le règlement et je m'engage dans ce tournoi », accepter.
// L'écran vit dans `features/player/tournamentRules/ui` ; pdf.js n'est chargé
// qu'à l'ouverture de la liseuse (import dynamique, hors premier chargement).
//
// Page qu'on ouvre depuis un lien (bandeau, notification, carte capitaine) :
// la redirection de session ramène ICI après la connexion, comme le dossier
// d'adversaire.

import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { loginHrefFor } from '@/utils/player/sessionExpiry';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import RulesReaderScreen from '@/features/player/tournamentRules/ui/RulesReaderScreen';

function TournamentRulesPage() {
  const router = useRouter();
  const { ready, loading: authLoading } = usePlayerSession({
    redirect: router.isReady,
    redirectTo: loginHrefFor(router.isReady ? router.asPath : '/player'),
  });
  const tournamentId =
    typeof router.query.id === 'string' ? router.query.id : null;

  if (authLoading || !ready || !tournamentId) return <PlayerPageSkeleton />;
  return <RulesReaderScreen tournamentId={tournamentId} />;
}

const rulesSeo: SeoProps = {
  title: { fr: 'Règlement du tournoi', en: 'Tournament rules' },
  description: {
    fr: 'Lire et valider le règlement du tournoi.',
    en: 'Read and accept the tournament rules.',
  },
  noindex: true,
};

TournamentRulesPage.seo = rulesSeo;

// Cache joueuse + coquille. La page garde sa propre redirection de session
// (retour `?next=` exact) : `redirectTo` absent.
export default withPlayerQuery(withPlayerShell(TournamentRulesPage));
