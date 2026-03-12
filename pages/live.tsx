import type { SeoProps } from '@/components/Seo/DefaultSeo';
import LiveTwitchSection from '@/components/Live/LiveTwitchSection';

function LivePage() {
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 pt-24 pb-20">
        <LiveTwitchSection />
      </div>
    </div>
  );
}

const liveSeo: SeoProps = {
  title: "Live | OW Women's Cup 2026",
  description:
    "Retrouvez nos chaînes partenaires, casts et analyses en direct pour l'OW Women's Cup 2026.",
};

LivePage.seo = liveSeo;

export default LivePage;
