// components/admin/broadcast/LiveConsoleHeader.tsx
//
// L'en-tête de « Twitch & interactions » (`pages/admin/broadcast/live.tsx`) :
// les onglets « Diffusion », puis le titre et ce à quoi sert l'écran.
//
// Il portait l'état du temps réel, le lien vers le director, la puce « overlay
// du run dans OBS » et un bouton de rafraîchissement : tout cela suivait un run
// (run-of-show), retiré faute d'avoir jamais servi. Les cartes qui restent
// (drops TCG, statut Twitch, prédictions / commandes) se rechargent seules —
// l'en-tête n'a plus rien à piloter.

import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';

export default function LiveConsoleHeader({
  heading,
  subtitle,
}: {
  heading: string;
  subtitle: string;
}) {
  return (
    <>
      <DiffusionTabsNav active="live" />
      <AdminPageHeader title={heading} subtitle={subtitle} />
    </>
  );
}
