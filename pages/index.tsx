/* eslint-disable @next/next/no-img-element */
import Header from '@/components/Header/header';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import HomeNewsSection from '@/components/News/HomeNewsSection';
import AnnouncementsTicker from '@/components/Ads/AnnouncementsTicker';
import PressSection from '@/components/Press/PressSection';

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
      <HomeNewsSection />
      <PressSection />
      <div id="sponsors" className="mt-20"></div>

      <div className="mt-5">
        <AnnouncementsTicker />
      </div>
    </div>
  );
}

const homeSeo: SeoProps = {
  title: "OW Women's Cup 2026",
  description:
    "Tournoi Overwatch 100% féminin : cast, équipes, inscriptions et infos clés de l'édition 2026 de l'OW Women's Cup.",
};

Home.seo = homeSeo;

export default Home;
