import '@/styles/globals.css';
import Navbar from '@/components/Navbar/navbar';
import Footer from '@/components/Footer/footer';
import BackToTopButton from '@/components/Buttons/BackToTopButton';
import { CookieBanner } from '@/components/CookieBanner';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import DefaultSeo, { SeoProps } from '@/components/Seo/DefaultSeo';

type AppPropsWithSeo = AppProps & {
  Component: AppProps['Component'] & { seo?: SeoProps };
};

function MyApp({ Component, pageProps }: AppPropsWithSeo) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return <></>;

  const seo = (Component as any)?.seo as SeoProps | undefined;

  return (
    <div>
      <DefaultSeo {...seo} />
      <Navbar />
      <Component {...pageProps} />
      <Footer />
      <BackToTopButton />
      <CookieBanner />
    </div>
  );
}

export default MyApp;
