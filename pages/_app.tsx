import '@/styles/globals.css';
import dynamic from 'next/dynamic';
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

type AppPropsWithSeo = AppProps & {
  Component: AppProps['Component'] & { seo?: SeoProps };
};

function MyApp({ Component, pageProps, router }: AppPropsWithSeo) {
  const seo = (Component as any)?.seo as SeoProps | undefined;
  const isAdmin = router.pathname.startsWith('/admin');
  const effectiveSeo: SeoProps = isAdmin
    ? { ...seo, noindex: true }
    : { ...seo };

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className={workSans.variable}>
          <DefaultSeo {...effectiveSeo} />
          <Navbar />
          <main id="main-content">
            <Component {...pageProps} />
          </main>
          <Footer />
          {!isAdmin && <FloatingSocials />}
          <BackToTopButton />
          <CookieBanner />
          <ToastContainer />
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default MyApp;
