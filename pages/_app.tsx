import '@/styles/globals.css';
import dynamic from 'next/dynamic';
import Footer from '@/components/Footer/footer';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { AppProps } from 'next/app';
import DefaultSeo, { SeoProps } from '@/components/Seo/DefaultSeo';

const Navbar = dynamic(() => import('@/components/Navbar/navbar'), {
  ssr: false,
});
const BackToTopButton = dynamic(
  () => import('@/components/Buttons/BackToTopButton'),
  { ssr: false }
);
const CookieBanner = dynamic(
  () =>
    import('@/components/CookieBanner').then((mod) => mod.CookieBanner),
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
      <div>
        <DefaultSeo {...effectiveSeo} />
        <Navbar />
        <Component {...pageProps} />
        <Footer />
        {!isAdmin && <FloatingSocials />}
        <BackToTopButton />
        <CookieBanner />
      </div>
    </ErrorBoundary>
  );
}

export default MyApp;
