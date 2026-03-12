import About from '@/components/About/about';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

function AboutPage() {
  return (
    <div className="mt-20">
      <About />
    </div>
  );
}

const aboutSeo: SeoProps = {
  title: "À propos – OW Women's Cup 2026",
  description:
    "Découvrez l'OW Women's Cup, tournoi Overwatch 100% féminin : notre mission, nos valeurs et comment devenir partenaire.",
};

AboutPage.seo = aboutSeo;

export default AboutPage;
