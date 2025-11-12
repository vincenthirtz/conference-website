/* eslint-disable @next/next/no-img-element */
import '../styles/globals.css';
import Navbar from '../components/Navbar/navbar';
import Footer from '../components/Footer/footer';
import BackToTopButton from '../components/Buttons/BackToTopButton';
import { AppProps } from 'next/app';
import Head from 'next/head'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div>
       <Head>
        {/* Simple Analytics */}
        <script
          async
          src="https://scripts.simpleanalyticscdn.com/latest.js"
        ></script>
        <noscript>
          <img
            src="https://queue.simpleanalyticscdn.com/noscript.gif"
            alt=""
            referrerPolicy="no-referrer-when-downgrade"
          />
        </noscript>
      </Head>

      <Navbar />
      <Component {...pageProps} />
      <Footer />
      <BackToTopButton />
    </div>
  );
}
export default MyApp;