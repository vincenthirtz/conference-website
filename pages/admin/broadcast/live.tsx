// pages/admin/broadcast/live.tsx
//
// Diffusion › « Twitch & interactions » : ce qu'on pilote sur la chaîne Twitch
// pendant un direct — statut d'antenne, prédictions, points de chaîne et
// commandes. (La santé des drops TCG est passée dans Diffusion › Overlays.)
//
// L'URL est restée `/admin/broadcast/live` (c'est le retour par défaut de
// l'OAuth Twitch, et des favoris pointent dessus), mais l'écran n'est plus la
// « console live » : sa moitié « run » (HUD, régie automatique, scènes,
// prochain match, antenne, PiP, bandeau, overlay `/overlay/<runId>`) suivait le
// run-of-show, jamais utilisé en production, et a été retirée avec lui. Restent
// les cartes qui ne dépendent d'aucun run.

import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import LiveConsoleHeader from '@/components/admin/broadcast/LiveConsoleHeader';
import TwitchStatusPanel from '@/components/admin/broadcast/TwitchStatusPanel';
import TwitchDrivePanels from '@/components/admin/broadcast/TwitchDrivePanels';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';
import nsAdminTwitchPredictions from '@/lib/i18n/locales/admin-fr/adminTwitchPredictions';

export const getServerSideProps = withStaffPage('caster');

function BroadcastLivePage() {
  const t = useAdminT(nsAdminBroadcastLive);
  const tw = useAdminT(nsAdminTwitchPredictions);
  const router = useRouter();
  const { addToast } = useToast();

  // Retour du flux OAuth Twitch : live.tsx peut recevoir ?twitch=connected|error.
  // On affiche le toast correspondant puis on NETTOIE le query param (shallow,
  // sans re-fetch SSR) pour ne pas rejouer le toast au refresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    if (!router.isReady) return;
    const twitch = router.query.twitch;
    if (twitch !== 'connected' && twitch !== 'error') return;
    addToast(
      twitch === 'connected' ? tw.oauthConnected : tw.oauthError,
      twitch === 'connected' ? 'success' : 'error'
    );
    const { twitch: _omit, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
  }, [router.isReady, router.query.twitch]);

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen text-[var(--t1,#f4edf7)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-header pb-8">
          <LiveConsoleHeader heading={t.heading} subtitle={t.subtitle} />

          {/* Le statut d'antenne, puis les deux panneaux d'écriture. Chacun se
              masque seul quand la permission manque — cet écran admet le rôle
              `caster`, plus large que les routes qu'il appelle. La santé des
              drops TCG vit dans Diffusion › Overlays, avec l'overlay TCG. */}
          <TwitchStatusPanel />
          <TwitchDrivePanels />
        </div>
      </div>
    </>
  );
}

// Cache de requêtes (lot L10) : les cartes de cet écran (chaînes Twitch,
// santé du drop TCG) n'ont pas de temps réel et lisent par ce cache.
export default withAdminQuery(BroadcastLivePage);
