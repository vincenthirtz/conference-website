/* eslint-disable @next/next/no-img-element */
import Header from '@/components/Header/header';
import About from '@/components/About/about';
import Heading from '@/components/Typography/heading';
import Subscription from '@/components/Form/subscription';
import Contact from '@/components/Form/Contact';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import PatchNotesSection from '@/components/News/PatchNotesSection';
import HomeNewsSection from '@/components/News/HomeNewsSection';
import LiveTwitchSection from '@/components/Live/LiveTwitchSection';

function Home() {
  return (
    <div>
      <img
        src="/img/illustra.png"
        className="color-effect"
        alt="background-illustration"
      />
      <Header />
      {/* <Popup /> */}
      <div id="about" className="mt-20">
        <About />
      </div>
      <HomeNewsSection />
      <PatchNotesSection />
      <div id="register" className="container mt-20 lg:mt-0">
        <div className="flex items-center flex-col justify-center">
          <LiveTwitchSection />
        </div>
      </div>
      <div id="sponsors" className="mt-20"></div>
      {/* Formulaire de contact */}
      <div
        id="contact"
        className="flex items-center flex-col justify-center pt-20 lg:pt-0 px-4"
      >
        <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
          Contact
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-10"
        >
          Faites nous un petit message
        </Heading>
        <Contact className="mt-20" />
      </div>

      <div className="mt-5">
        <Subscription />
      </div>
    </div>
  );
}

const homeSeo: SeoProps = {
  title: "OW Women's Cup 2025",
  description:
    "Tournoi Overwatch 100% féminin : cast, équipes, inscriptions et infos clés de l'édition 2025 de l'OW Women's Cup.",
};

Home.seo = homeSeo;

export default Home;
