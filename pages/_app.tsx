import '@/styles/globals.css';
import Navbar from '@/components/Navbar/navbar';
import Footer from '@/components/Footer/footer';
import BackToTopButton from '@/components/Buttons/BackToTopButton';
import { CookieBanner } from '@/components/CookieBanner';
import ErrorBoundary from '@/components/ErrorBoundary';
import FloatingSocials from '@/components/Socials/FloatingSocials';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import DefaultSeo, { SeoProps } from '@/components/Seo/DefaultSeo';

type AppPropsWithSeo = AppProps & {
  Component: AppProps['Component'] & { seo?: SeoProps };
};

function MyApp({ Component, pageProps, router }: AppPropsWithSeo) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return <></>;

  const seo = (Component as any)?.seo as SeoProps | undefined;
  const isAdmin = router.pathname.startsWith('/admin');

  return (
    <ErrorBoundary>
      <div>
        <DefaultSeo {...seo} />
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
