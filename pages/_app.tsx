/* eslint-disable @next/next/no-img-element */
import '../styles/globals.css';
import Navbar from '../components/Navbar/navbar';
import Footer from '../components/Footer/footer';
import BackToTopButton from '../components/Buttons/BackToTopButton';
import { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div>
      <Navbar />
      <Component {...pageProps} />
      <Footer />
      <BackToTopButton />
    </div>
  );
}
export default MyApp;