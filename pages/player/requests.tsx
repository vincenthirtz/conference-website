// pages/player/requests.tsx — demandes ÉMISES par la joueuse : transfert
// (pour soi ou proposé pour une coéquipière) et scrim. Coquille : l'état et
// les gestes vivent dans features/player/demandes (lot P11).

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { tabButtonId, tabPanelId } from '@/components/ui/Tabs';
import { Card, PageHeader } from '@/features/ruban';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { loginHrefFor } from '@/utils/player/sessionExpiry';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import { useRequestsScreen } from '@/features/player/demandes/hooks/useRequestsScreen';
import RequestTabs, {
  REQUESTS_TAB_BASE,
} from '@/features/player/demandes/ui/RequestTabs';
import TransferRequestForm from '@/features/player/demandes/ui/TransferRequestForm';
import ScrimRequestForm from '@/features/player/demandes/ui/ScrimRequestForm';
import { ErrorBanner } from '@/features/player/demandes/ui/formPrimitives';

function PlayerRequestsPage() {
  const router = useRouter();
  // Retour à CETTE page après connexion (`?next=`), requête comprise — un
  // lien partagé (`?tab=scrim&team=…`) garde sa destination. Avant
  // hydratation `asPath` n'est pas fiable : repli sur `/player/requests`.
  const { user, loading: authLoading } = usePlayerSession({
    // Armée seulement routeur prêt : avant, la requête du lien était perdue.
    redirect: router.isReady,
    redirectTo: loginHrefFor(
      router.isReady ? router.asPath : '/player/requests'
    ),
  });
  const screen = useRequestsScreen(user?.id ?? null);
  const { t, tab } = screen;

  if (authLoading || screen.loading) {
    return <PlayerPageSkeleton rows={3} />;
  }
  if (!user) return null;

  return (
    <>
      <Head>
        <title>{t.pageTitleTab}</title>
      </Head>

      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-6 pt-header lg:px-6">
        <Link
          href="/player"
          className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
        >
          &larr; {t.backToSpace}
        </Link>

        <PageHeader title={t.heading} subtitle={t.intro} />

        <Card>
          {/* Cette page n'émet que des demandes : les candidatures REÇUES se
              traitent dans la gestion d'équipe. */}
          <Link
            href="/player/manage-team"
            className="mb-6 flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3 text-sm hover:bg-[var(--s2,#1d1520)]"
          >
            <span>
              <span className="block font-semibold text-[var(--t1,#f4edf7)]">
                {t.receivedTitle}
              </span>
              <span className="block text-xs text-[var(--t3,#a39ba6)]">
                {t.receivedDesc}
              </span>
            </span>
            <span aria-hidden="true">&rarr;</span>
          </Link>

          {screen.connectionError && (
            <div className="mb-6">
              <ErrorBanner message={screen.connectionError} />
            </div>
          )}

          <p
            id="requests-success"
            role="status"
            aria-live="polite"
            className="text-sm text-[var(--ok,#30d07e)] empty:hidden [&:not(:empty)]:mb-6"
          >
            {screen.success}
          </p>

          <RequestTabs tab={tab} onTabChange={screen.changeTab} />

          {/* Identifiants fournis par la primitive, des deux côtés. */}
          <div
            role="tabpanel"
            id={tabPanelId(REQUESTS_TAB_BASE, tab)}
            aria-labelledby={tabButtonId(REQUESTS_TAB_BASE, tab)}
          >
            {tab === 'transfer' && <TransferRequestForm screen={screen} />}
            {tab === 'scrim' && <ScrimRequestForm screen={screen} />}
          </div>
        </Card>
      </div>
    </>
  );
}

const playerRequestsSeo: SeoProps = {
  title: {
    fr: 'Demandes',
    en: 'Requests',
  },
  description: {
    fr: "Gère tes demandes de transfert et de scrim sur l'OW Women's Cup.",
    en: "Manage your transfer and scrim requests on OW Women's Cup.",
  },
  noindex: true,
};

PlayerRequestsPage.seo = playerRequestsSeo;

// Coquille joueuse (lot P8) + cache joueuse (annuaire d'équipes). La page
// garde sa propre redirection de session : `redirectTo` absent.
export default withPlayerQuery(withPlayerShell(PlayerRequestsPage));
