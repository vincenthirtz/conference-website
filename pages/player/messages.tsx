// pages/player/messages.tsx — coquille de la messagerie entre capitaines :
// SEO + coquille joueuse. L'écran vit dans le module features/player/messages
// (lot P15, archétype Fil) ; la mécanique de rafraîchissement (temps réel +
// relecture silencieuse) est inchangée (hooks/useCaptainMessages).

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import MessagesScreen from '@/features/player/messages/ui/MessagesScreen';

function MessagesPage() {
  return <MessagesScreen />;
}

const playerMessagesSeo: SeoProps = {
  title: { fr: 'Messagerie', en: 'Messages' },
  description: {
    fr: "Échange avec les autres capitaines de l'OW Women's Cup.",
    en: "Chat with the other OW Women's Cup captains.",
  },
  noindex: true,
};

MessagesPage.seo = playerMessagesSeo;

// La page garde sa propre redirection de session (vers l'adresse courante,
// conversation ouverte comprise) : `redirectTo` absent de la coquille.
export default withPlayerShell(MessagesPage);
