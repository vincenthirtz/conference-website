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
};

function MyApp({ Component, pageProps, router }: AppPropsWithSeo) {
  const seo = (Component as any)?.seo as SeoProps | undefined;
  const isAdmin = router.pathname.startsWith('/admin');
  const isCaster = router.pathname.startsWith('/caster');
  const isPlayer = router.pathname.startsWith('/player');
  // Routes "applicatives" (admin + cockpit caster) : pas d index, pas de
  // navbar/footer marketing par defaut (chaque page caster gere sa propre
  // chrome legere — cf. /caster/login, /caster/cockpit).
  const effectiveSeo: SeoProps =
    isAdmin || isCaster ? { ...seo, noindex: true } : { ...seo };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NEXT_PUBLIC_ENABLE_PWA !== '1') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.error('[PWA] SW registration failed:', err);
    });
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className={workSans.variable}>
          {isAdmin && (
            <Head>
              <link rel="manifest" href="/admin/manifest.webmanifest" />
              <meta name="apple-mobile-web-app-capable" content="yes" />
              <meta
                name="apple-mobile-web-app-status-bar-style"
                content="default"
              />
            </Head>
          )}
          {isCaster && (
            <Head>
              <link rel="manifest" href="/caster/manifest.webmanifest" />
              <meta name="apple-mobile-web-app-capable" content="yes" />
              <meta
                name="apple-mobile-web-app-status-bar-style"
                content="default"
              />
            </Head>
          )}
          {isPlayer && (
            <Head>
              <link rel="manifest" href="/player/manifest.webmanifest" />
              <meta name="apple-mobile-web-app-capable" content="yes" />
              <meta
                name="apple-mobile-web-app-status-bar-style"
                content="default"
              />
            </Head>
          )}
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
    </ErrorBoundary>
  );
}

export default MyApp;
