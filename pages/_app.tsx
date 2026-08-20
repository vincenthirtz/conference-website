import '@/styles/globals.css';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect, useMemo } from 'react';
import { Work_Sans } from 'next/font/google';
import Footer from '@/components/Footer/footer';
import Navbar from '@/components/Navbar/navbar';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { AppProps } from 'next/app';
import DefaultSeo, { SeoProps } from '@/components/Seo/DefaultSeo';
import { ToastProvider } from '@/components/Toast';
import { ToastContainer } from '@/components/Toast';
import { LanguageProvider } from '@/lib/i18n/LanguageProvider';
import { SessionProvider } from '@/hooks/useSession';
import { TenantBrandingProvider } from '@/lib/branding/TenantBrandingProvider';
import { ActiveTeamProvider } from '@/components/player/ActiveTeamContext';
import type { TenantBranding } from '@/utils/tenant';

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const BackToTopButton = dynamic(
  () => import('@/components/Buttons/BackToTopButton'),
  { ssr: false }
);
const CookieBanner = dynamic(
  () => import('@/components/CookieBanner').then((mod) => mod.CookieBanner),
  { ssr: false }
);
const FloatingSocials = dynamic(
  () => import('@/components/Socials/FloatingSocials'),
  { ssr: false }
);
const PushOptIn = dynamic(() => import('@/components/admin/PushOptIn'), {
  ssr: false,
});
const PWAInstallAndUpdate = dynamic(
  () => import('@/components/PWAInstallAndUpdate'),
  { ssr: false }
);
const OfflineBanner = dynamic(() => import('@/components/OfflineBanner'), {
  ssr: false,
});

type AppPropsWithSeo = AppProps & {
  Component: AppProps['Component'] & { seo?: SeoProps };
  // Injecté au SSR par `enhanceApp` dans `_document.tsx` (WHITELABEL). Absent
  // (undefined) à l'hydratation client : le provider relit alors l'île JSON.
  branding?: TenantBranding | null;
};

function MyApp({ Component, pageProps, router, branding }: AppPropsWithSeo) {
  // SEO resolution order:
  //   1. `pageProps.seo` — DYNAMIC, per-entity SEO returned by a page's
  //      getStaticProps/getServerSideProps (ISR pages : profil joueuse,
  //      league…). Takes precedence so the meta reflect the fetched entity.
  //   2. `Component.seo` — STATIC property on the page component (the historic
  //      mechanism, used by every static page).
  const dynamicSeo = (pageProps as { seo?: SeoProps } | undefined)?.seo;
  const staticSeo = (Component as any)?.seo as SeoProps | undefined;
  const seo = dynamicSeo ?? staticSeo;
  const isAdmin = router.pathname.startsWith('/admin');
  const isCaster = router.pathname.startsWith('/caster');
  // Espace joueur PRIVÉ (auth, gate client) → noindex + manifest dédié.
  // Exception : `/player/[userId]` est le profil PUBLIC (rating/H2H, ISR,
  // indexable). Il vit sous /player/* pour des raisons de routing mais doit
  // rester référençable — on l'exclut donc du scope "applicatif".
  const isPublicPlayerProfile = router.pathname === '/player/[userId]';
  const isPlayer =
    router.pathname.startsWith('/player') && !isPublicPlayerProfile;
  // Embeddable surfaces (iframe) render bare: no Navbar/Footer/Toast/cookie
  // banner/socials. They are read-only and meant to be framed by third parties.
  const isEmbed = router.pathname.startsWith('/embed');
  // OBS browser-source overlays (`/overlay/*`, broadcast renderer) render
  // chrome-less too: no Navbar/Footer/Toast/cookie banner. They may run for
  // hours in OBS and must composite cleanly over the video canvas.
  const isOverlay = router.pathname.startsWith('/overlay');
  // Routes "applicatives" (admin + cockpit caster + espace joueur) : pas
  // d'index. L'espace joueur est gate cote client et n'a pas de contenu
  // public a referencer — on force noindex pour eviter d'indexer des coquilles
  // vides / pages d'auth. La navbar/footer marketing restent (sauf caster qui
  // gere sa propre chrome legere — cf. /caster/cockpit).
  const effectiveSeo: SeoProps =
    isAdmin || isCaster || isPlayer || isEmbed || isOverlay
      ? { ...seo, noindex: true }
      : { ...seo };

  const manifestHref = useMemo(() => {
    if (isAdmin) return '/admin/manifest.webmanifest';
    if (isCaster) return '/caster/manifest.webmanifest';
    if (isPlayer) return '/player/manifest.webmanifest';
    return '/site.webmanifest';
  }, [isAdmin, isCaster, isPlayer]);

  const isAppScope = isAdmin || isCaster || isPlayer;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NEXT_PUBLIC_ENABLE_PWA !== '1') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.error('[PWA] SW registration failed:', err);
    });
  }, []);

  // Bare pages (iframe embeds + OBS overlays): render only the page, no
  // global chrome (Navbar/Footer/Toast/cookie banner/socials).
  if (isEmbed || isOverlay) {
    return (
      <ErrorBoundary>
        <TenantBrandingProvider branding={branding}>
          <div className={workSans.variable}>
            <DefaultSeo {...effectiveSeo} />
            <Component {...pageProps} />
          </div>
        </TenantBrandingProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TenantBrandingProvider branding={branding}>
        <SessionProvider>
          <LanguageProvider>
            {/* Équipe active : global (et pas seulement dans l'espace joueuse)
                parce que la cloche de notifications vit dans la Navbar. Un
                manager multi-équipes doit voir le compteur de l'équipe qu'il
                a choisie, pas d'une autre. Sans choix — le cas de tout le
                monde — le contexte est inerte. */}
            <ActiveTeamProvider>
              <ToastProvider>
                <div className={workSans.variable}>
                  <Head>
                    <link key="manifest" rel="manifest" href={manifestHref} />
                    {isAppScope && (
                      <meta
                        key="apple-wac"
                        name="apple-mobile-web-app-capable"
                        content="yes"
                      />
                    )}
                    {isAppScope && (
                      <meta
                        key="apple-sbs"
                        name="apple-mobile-web-app-status-bar-style"
                        content="default"
                      />
                    )}
                  </Head>
                  <DefaultSeo {...effectiveSeo} />
                  {!isCaster && <Navbar />}
                  <main id="main-content">
                    <Component {...pageProps} />
                  </main>
                  {isAdmin && <PushOptIn />}
                  {(isAdmin || isCaster) && <PWAInstallAndUpdate />}
                  {(isAdmin || isCaster) && <OfflineBanner />}
                  {!isCaster && <Footer />}
                  {!isAdmin && !isCaster && <FloatingSocials />}
                  <BackToTopButton />
                  <CookieBanner />
                  <ToastContainer />
                </div>
              </ToastProvider>
            </ActiveTeamProvider>
          </LanguageProvider>
        </SessionProvider>
      </TenantBrandingProvider>
    </ErrorBoundary>
  );
}

export default MyApp;
