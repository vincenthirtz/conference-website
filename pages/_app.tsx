import '@/styles/globals.css';
import Navbar from '@/components/Navbar/navbar';
import Footer from '@/components/Footer/footer';
import BackToTopButton from '@/components/Buttons/BackToTopButton';
import { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { supabaseClient } from '@/utils/supabase';

function MyApp({ Component, pageProps }: AppProps) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return <></>;

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={(pageProps as any).initialSession}
    >
      <div>
        <Navbar />
        <Component {...pageProps} />
        <Footer />
        <BackToTopButton />
      </div>
    </SessionContextProvider>
  );
}

export default MyApp;
