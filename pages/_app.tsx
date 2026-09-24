import '@/styles/globals.css';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect } from 'react';
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
import { resolveAppChrome } from '@/utils/layout/appChrome';

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
// Mesure d'audience : purement client (lit le consentement en localStorage) et
// no-op tant que NEXT_PUBLIC_ANALYTICS_* n'est pas configuré.
const AnalyticsScript = dynamic(
  () => import('@/components/Analytics/AnalyticsScript'),
  { ssr: false }
);

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
  // La propriété statique `seo` n'existe pas sur le type de page de Next :
  // on l'expose ici explicitement plutôt que d'éteindre la vérification.
  const staticSeo = (Component as { seo?: SeoProps }).seo;
  const seo = dynamicSeo ?? staticSeo;
  // Ce qui entoure la page (en-tête, pied, réseaux, mesure, indexation,
  // manifeste) : une règle par type de page, dans utils/layout/appChrome.ts
  // (refonte des menus, plan 9) — plus des conditions éparpillées ici.
  const chrome = resolveAppChrome(router.pathname);
  const isAdmin = router.pathname.startsWith('/admin');
  const isCaster = router.pathname.startsWith('/caster');
  const effectiveSeo: SeoProps = chrome.noindex
    ? { ...seo, noindex: true }
    : { ...seo };
  const manifestHref = chrome.manifest;
  const isAppScope = chrome.appScope;

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
  if (chrome.bare) {
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
                  {chrome.navbar && <Navbar />}
                  <main id="main-content">
                    <Component {...pageProps} />
                  </main>
                  {isAdmin && <PushOptIn />}
                  {(isAdmin || isCaster) && <PWAInstallAndUpdate />}
                  {(isAdmin || isCaster) && <OfflineBanner />}
                  {chrome.footer && <Footer />}
                  {chrome.floatingSocials && <FloatingSocials />}
                  <BackToTopButton />
                  <CookieBanner />
                  {/* Ni l'admin ni le cockpit caster ne sont mesurés : ce sont
                      des surfaces internes, leur trafic fausserait l'entonnoir
                      d'acquisition. */}
                  {chrome.analytics && <AnalyticsScript />}
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
